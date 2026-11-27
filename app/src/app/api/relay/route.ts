import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress, isHex, parseEventLogs, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MANDATE_ABI, REASON_CODES } from "@lex/sdk";
import { CHAIN_ID, CONTRACTS, RPC_URL } from "@/config/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
const allowed = (process.env.RELAY_MANDATE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const chain: Chain = {
  id: CHAIN_ID, name: `HashKey Chain (${CHAIN_ID})`,
  nativeCurrency: {name: "HSK", symbol: "HSK", decimals: 18},
  rpcUrls: {default: {http: [RPC_URL]}},
};
const json = (body: unknown, status = 200) => NextResponse.json(body, {status});
const configValid = () => {
  if (!key || !CONTRACTS.mandate || !isAddress(CONTRACTS.mandate)) return false;
  try { privateKeyToAccount(key); return true; } catch { return false; }
};

export async function GET() {
  const enabled = configValid();
  return json({enabled, relayer: enabled ? privateKeyToAccount(key!).address : null, chainId: CHAIN_ID,
    mandateContract: CONTRACTS.mandate || null, mandateIds: allowed.length ? allowed : "any"});
}

export async function POST(req: Request) {
  if (!configValid()) return json({relayed: false, paid: false, error: "Relayer is not configured"}, 503);
  let intent: {mandateId: bigint; amount: bigint; counterparty: `0x${string}`; category: Hex; ref: Hex; hspOrderId: Hex; nonce: bigint; deadline: bigint};
  let signature: Hex;
  try {
    // Reject oversized inputs before parsing. Deployment infrastructure should also impose a body limit.
    const length = Number(req.headers.get("content-length") || "0");
    if (length > 16384) throw new Error("body too large");
    const raw = await req.text();
    if (raw.length > 16384) throw new Error("body too large");
    const body = JSON.parse(raw); const i = body.intent;
    const bytes32 = (v: unknown): v is Hex => typeof v === "string" && isHex(v) && v.length === 66;
    const uint = (v: unknown): bigint => {
      if (typeof v !== "string" || !/^\d{1,78}$/.test(v)) throw new Error("bad integer");
      const n = BigInt(v); if (n >= 2n ** 256n) throw new Error("integer overflow"); return n;
    };
    if (!i || !isAddress(i.counterparty) || !bytes32(i.category) || !bytes32(i.ref) || !bytes32(i.hspOrderId) ||
        typeof body.signature !== "string" || !isHex(body.signature) || body.signature.length !== 132) throw new Error("bad field");
    intent = {mandateId: uint(i.mandateId), amount: uint(i.amount), counterparty: i.counterparty,
      category: i.category, ref: i.ref, hspOrderId: i.hspOrderId, nonce: uint(i.nonce), deadline: uint(i.deadline)};
    signature = body.signature;
  } catch {
    return json({relayed: false, paid: false, error: "Malformed intent. Send { intent, signature } with unsigned integers as decimal strings."}, 400);
  }
  if (allowed.length && !allowed.includes(intent.mandateId.toString()))
    return json({relayed: false, paid: false, error: `This relayer does not serve mandate ${intent.mandateId}`}, 403);

  let txHash: Hex | undefined;
  try {
    const client = createPublicClient({chain, transport: http(RPC_URL)});
    if (await client.getChainId() !== CHAIN_ID) throw new Error("RPC chain ID does not match configured chain");
    const [ok, reasonCode, agent] = await client.readContract({address: CONTRACTS.mandate, abi: MANDATE_ABI, functionName: "canExecuteIntent", args: [intent, signature]});
    if (!ok) return json({relayed: false, paid: false, agent, reasonCode, reason: REASON_CODES[reasonCode] ?? `UNKNOWN_${reasonCode}`}, 422);

    const wallet = createWalletClient({account: privateKeyToAccount(key!), chain, transport: http(RPC_URL)});
    txHash = await wallet.writeContract({address: CONTRACTS.mandate, abi: MANDATE_ABI, functionName: "executeSpendIntent", args: [intent, signature]});
    const receipt = await client.waitForTransactionReceipt({hash: txHash});
    if (receipt.status !== "success") return json({relayed: true, paid: false, error: "Transaction reverted", txHash}, 502);
    const logs = receipt.logs.filter((l) => l.address.toLowerCase() === CONTRACTS.mandate.toLowerCase());
    const events = parseEventLogs({abi: MANDATE_ABI, logs, eventName: "SpendDecision"});
    const event = events.find((e) => e.args.mandateId === intent.mandateId);
    if (!event || event.args.receiptId === undefined) return json({relayed: true, paid: false, error: "Missing decision event; verify transaction on chain", txHash}, 502);
    const decision = ["ALLOW", "REFUSE", "EXCEPTION"][Number(event.args.decision)] || "UNKNOWN";
    const code = Number(event.args.reasonCode);
    return json({relayed: true, paid: decision === "ALLOW", agent, receiptId: event.args.receiptId.toString(), txHash,
      decision, reasonCode: code, reason: REASON_CODES[code] ?? `UNKNOWN_${code}`});
  } catch (e: any) {
    // If a hash is available, the transaction may still be pending even if confirmation failed.
    return json({relayed: Boolean(txHash), paid: false, txHash, error: e?.shortMessage || e?.message || "Relay failed"}, 502);
  }
}
