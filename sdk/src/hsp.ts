/**
 * HSP (HashKey Settlement Protocol) rail for Lex.
 *
 * Two sides:
 *  - Payer: a Lex agent receives an HSP Cart Mandate from a merchant, checks it,
 *    and pays through its mandate. The mandate rules still decide; the receipt
 *    stores the HSP payment request id (hashed) as `hspOrderId` and the cart hash as `ref`.
 *  - Merchant: an agent that sells through HSP creates orders (signed Cart Mandate +
 *    HMAC-signed request), checks payment status, and verifies webhooks.
 *
 * Uses Web Crypto and viem only, so it runs in Node 18+ and the browser.
 * Request signing follows the HSP merchant API (X-App-Key, X-Signature, X-Timestamp, X-Nonce).
 */

import {
  sha256,
  keccak256,
  toBytes,
  toHex,
  bytesToHex,
  parseUnits,
  recoverAddress,
  getAddress,
  type Hex,
} from "viem";
import { sign } from "viem/accounts";
import type { Lex } from "./index.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface HspAmount {
  currency: string;
  value: string;
}

export interface HspCartContents {
  id: string;
  user_cart_confirmation_required: boolean;
  merchant_name: string;
  cart_expiry: string;
  payment_request: {
    method_data: Array<{
      supported_methods: string;
      data: {
        supported_methods: string;
        x402Version: number;
        network: string;
        chain_id: number;
        contract_address: string;
        pay_to: string;
        coin: string;
      };
    }>;
    details: {
      id: string;
      display_items: Array<{ label: string; amount: HspAmount }>;
      total: { label: string; amount: HspAmount };
    };
  };
}

export interface HspCartMandate {
  contents: HspCartContents;
  merchant_authorization: string; // ES256K JWT
}

export interface HspCartCheck {
  ok: boolean;
  errors: string[];
  paymentRequestId: string;
  payTo: `0x${string}`;
  token: `0x${string}`;
  chainId: number;
  amount: bigint; // token smallest unit
  cartHash: Hex;
  hspOrderId: Hex; // keccak256(paymentRequestId), stored on the Lex receipt
}

export type HspPaymentStatus =
  | "payment-required"
  | "payment-submitted"
  | "payment-verified"
  | "payment-processing"
  | "payment-safe"
  | "payment-included"
  | "payment-successful"
  | "payment-failed"
  | string;

// ── Encoding helpers ───────────────────────────────────────────────────

/** Sorted-key JSON with no whitespace. Matches the HSP cart_hash input. */
export function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256hex(s: string): string {
  return sha256(toBytes(s)).slice(2);
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return bytesToHex(sig).slice(2);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** bytes32 id stored on the Lex receipt for an HSP payment request */
export function hspOrderIdOf(paymentRequestId: string): Hex {
  return keccak256(toBytes(paymentRequestId));
}

// ── Payer side ─────────────────────────────────────────────────────────

/**
 * Checks an HSP Cart Mandate before paying it.
 * Verifies the cart hash in the merchant JWT, expiry, chain, token, and that the
 * ES256K signature recovers to `merchantSigner`.
 * Without a signer the cart is rejected, unless `allowUnverifiedMerchant` is set:
 * an unsigned check only proves the cart is self-consistent, not who issued it.
 */
export async function checkCartMandate(
  cart: HspCartMandate,
  opts: {
    chainId: number;
    token: `0x${string}`;
    decimals?: number;
    merchantSigner?: `0x${string}`;
    allowUnverifiedMerchant?: boolean;
    now?: number;
  }
): Promise<HspCartCheck> {
  const errors: string[] = [];
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const decimals = opts.decimals ?? 6;
  const method = cart.contents?.payment_request?.method_data?.[0]?.data;
  const details = cart.contents?.payment_request?.details;

  if (!method || !details) {
    throw new Error("Malformed cart mandate: missing payment_request");
  }

  const cartHash = `0x${sha256hex(canonicalJSON(cart.contents))}` as Hex;

  if (!opts.merchantSigner && !opts.allowUnverifiedMerchant) {
    errors.push("merchantSigner required to verify who issued the cart");
  }

  // JWT
  const parts = (cart.merchant_authorization || "").split(".");
  if (parts.length !== 3) {
    errors.push("merchant_authorization is not a JWT");
  } else {
    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    if (header.alg !== "ES256K") errors.push(`unexpected JWT alg ${header.alg}`);
    if (`0x${claims.cart_hash}` !== cartHash) errors.push("cart_hash does not match cart contents");
    if (typeof claims.exp === "number" && claims.exp < now) errors.push("merchant authorization expired");

    if (opts.merchantSigner) {
      const sig = base64urlDecode(parts[2]);
      if (sig.length !== 64) {
        errors.push("signature is not 64-byte r||s");
      } else {
        const hash = sha256(toBytes(`${parts[0]}.${parts[1]}`));
        const rs = bytesToHex(sig);
        let matched = false;
        for (const v of ["1b", "1c"]) {
          try {
            const addr = await recoverAddress({ hash, signature: `${rs}${v}` as Hex });
            if (getAddress(addr) === getAddress(opts.merchantSigner)) matched = true;
          } catch {}
        }
        if (!matched) errors.push("merchant signature does not match merchantSigner");
      }
    }
  }

  const expiry = Date.parse(cart.contents.cart_expiry);
  if (!Number.isNaN(expiry) && expiry / 1000 < now) errors.push("cart expired");
  if (Number(method.chain_id) !== opts.chainId) errors.push(`cart chain ${method.chain_id} != ${opts.chainId}`);
  if (getAddress(method.contract_address) !== getAddress(opts.token)) {
    errors.push("cart token does not match mandate token");
  }

  const totalValue = details.total.amount.value;
  const amount = parseUnits(totalValue, decimals);
  if (amount <= 0n) errors.push("cart total must be positive");

  return {
    ok: errors.length === 0,
    errors,
    paymentRequestId: details.id,
    payTo: getAddress(method.pay_to),
    token: getAddress(method.contract_address),
    chainId: Number(method.chain_id),
    amount,
    cartHash,
    hspOrderId: hspOrderIdOf(details.id),
  };
}

/**
 * Pays an HSP cart through a Lex mandate.
 * The mandate rules engine decides; a REFUSE still produces a receipt.
 * Receipt fields: ref = cart hash, hspOrderId = keccak256(payment request id).
 */
export async function payHspCart(
  lex: Lex,
  mandateId: bigint,
  cart: HspCartMandate,
  opts: {
    category: Hex;
    merchantSigner?: `0x${string}`;
    allowUnverifiedMerchant?: boolean;
    decimals?: number;
  }
): Promise<{ check: HspCartCheck; receiptId?: bigint; txHash?: `0x${string}` }> {
  const info = await lex.getMandate(mandateId);
  const chainId = lex.publicClient.chain?.id ?? 177;
  const check = await checkCartMandate(cart, {
    chainId,
    token: info.token,
    decimals: opts.decimals,
    merchantSigner: opts.merchantSigner,
    allowUnverifiedMerchant: opts.allowUnverifiedMerchant,
  });
  if (!check.ok) return { check };

  const { receiptId, txHash } = await lex.spend(
    mandateId,
    check.amount,
    check.payTo,
    opts.category,
    check.cartHash,
    check.hspOrderId
  );
  return { check, receiptId, txHash };
}

// ── Merchant side ──────────────────────────────────────────────────────

export interface HspMerchantConfig {
  baseUrl: string; // e.g. https://merchant-qa.hashkeymerchant.com
  appKey: string;
  appSecret: string;
  merchantName: string;
  merchantPrivateKey: Hex; // secp256k1 key that signs Cart Mandates
  network: string; // e.g. "hashkey-testnet"
  chainId: number;
}

export class HspMerchant {
  constructor(private cfg: HspMerchantConfig) {}

  /** Builds and signs a Cart Mandate (ES256K JWT over the cart hash). */
  async buildCartMandate(p: {
    cartId: string;
    paymentRequestId: string;
    payTo: `0x${string}`;
    token: `0x${string}`;
    coin: string; // e.g. "USDC"
    amount: string; // decimal string, e.g. "2.50"
    label?: string;
    expiryHours?: number;
  }): Promise<HspCartMandate> {
    const expiryHours = p.expiryHours ?? 2;
    const iat = Math.floor(Date.now() / 1000);
    const amount: HspAmount = { currency: "USD", value: p.amount };

    const contents: HspCartContents = {
      id: p.cartId,
      user_cart_confirmation_required: true,
      merchant_name: this.cfg.merchantName,
      cart_expiry: new Date((iat + expiryHours * 3600) * 1000).toISOString(),
      payment_request: {
        method_data: [
          {
            supported_methods: "https://www.x402.org/",
            data: {
              supported_methods: "https://www.x402.org/",
              x402Version: 2,
              network: this.cfg.network,
              chain_id: this.cfg.chainId,
              contract_address: p.token,
              pay_to: p.payTo,
              coin: p.coin,
            },
          },
        ],
        details: {
          id: p.paymentRequestId,
          display_items: [{ label: p.label ?? "Payment", amount }],
          total: { label: "Total", amount },
        },
      },
    };

    const header = { alg: "ES256K", typ: "JWT" };
    const claims = {
      iss: this.cfg.merchantName,
      sub: this.cfg.merchantName,
      aud: "HashkeyMerchant",
      iat,
      exp: iat + expiryHours * 3600,
      jti: `JWT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cart_hash: sha256hex(canonicalJSON(contents)),
    };
    const enc = new TextEncoder();
    const signingInput = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(
      enc.encode(JSON.stringify(claims))
    )}`;
    const sig = await sign({ hash: sha256(toBytes(signingInput)), privateKey: this.cfg.merchantPrivateKey });
    const raw = toRawRS(sig);

    return { contents, merchant_authorization: `${signingInput}.${base64url(raw)}` };
  }

  /** POST /api/v1/merchant/orders */
  async createOrder(cart: HspCartMandate, redirectUrl?: string) {
    const body = { cart_mandate: cart, redirect_url: redirectUrl ?? "" };
    const data = await this.request("POST", "/api/v1/merchant/orders", "", body);
    const payload = data.data || data.result || {};
    const paymentRequestId = payload.payment_request_id || payload.paymentRequestId;
    const paymentUrl = payload.payment_url || payload.paymentUrl;
    if (!paymentRequestId || !paymentUrl) throw new Error("HSP order response missing id or url");
    return {
      paymentRequestId: String(paymentRequestId),
      paymentUrl: String(paymentUrl),
      cartMandateId: String(payload.cart_mandate_id || payload.cartMandateId || cart.contents.id),
    };
  }

  /** GET /api/v1/merchant/payments?payment_request_id= */
  async getPaymentStatus(paymentRequestId: string) {
    const query = `payment_request_id=${encodeURIComponent(paymentRequestId)}`;
    const data = await this.request("GET", "/api/v1/merchant/payments", query);
    let payload = data.data || data.result || {};
    if (Array.isArray(payload)) payload = payload[0] || {};
    return {
      status: (payload.status || "unknown") as HspPaymentStatus,
      txHash: (payload.tx_signature || payload.tx_hash || payload.txHash) as string | undefined,
      amount: payload.amount as string | undefined,
      token: payload.token as string | undefined,
      failureReason:
        payload.failure_reason || payload.fail_reason || payload.status_reason || payload.reason || undefined,
      raw: payload,
    };
  }

  /** Verifies an inbound webhook body against its hex HMAC-SHA256 signature. */
  async verifyWebhook(rawBody: string, signatureHex: string): Promise<boolean> {
    const expected = await hmacSha256Hex(this.cfg.appSecret, rawBody);
    return timingSafeEqualHex(expected, signatureHex.toLowerCase().replace(/^0x/, ""));
  }

  private async request(method: "GET" | "POST", path: string, query: string, body?: unknown) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const bodyStr = body === undefined ? "" : JSON.stringify(body);
    const bodyHash = body === undefined ? "" : sha256hex(bodyStr);
    const signature = await hmacSha256Hex(
      this.cfg.appSecret,
      `${method}\n${path}\n${query}\n${bodyHash}\n${timestamp}\n${nonce}`
    );
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}${path}${query ? `?${query}` : ""}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-App-Key": this.cfg.appKey,
        "X-Signature": signature,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
      },
      body: body === undefined ? undefined : bodyStr,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HSP ${method} ${path} failed: ${res.status}`);
    const data = await res.json();
    if (data.code !== 0) throw new Error(`HSP error: ${data.msg ?? data.code}`);
    return data;
  }
}

/** Accepts viem's sign() result as hex or object and returns 64-byte r||s */
function toRawRS(sig: unknown): Uint8Array {
  if (typeof sig === "string") return toBytes(sig as Hex).slice(0, 64);
  const s = sig as { r: Hex; s: Hex };
  const r = toBytes(toHex(BigInt(s.r), { size: 32 }));
  const ss = toBytes(toHex(BigInt(s.s), { size: 32 }));
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(ss, 32);
  return out;
}
