# HSP Integration

HSP (HashKey Settlement Protocol) is HashKey's settlement layer for agent and merchant payments. It builds on AP2 and uses x402-style payment requests. Lex supports it from both sides: an agent paying an HSP merchant, and an agent selling through HSP.

## Payer side: an agent pays an HSP cart

An HSP merchant issues a **Cart Mandate**:

```
contents
  id, merchant_name, cart_expiry, user_cart_confirmation_required
  payment_request
    method_data[0].data: x402Version, network, chain_id, contract_address, pay_to, coin
    details: id (payment request id), display_items, total.amount.value
merchant_authorization   ES256K JWT, claims include cart_hash = sha256(canonical JSON of contents)
```

`payHspCart(lex, mandateId, cart, { category })` does the following:

1. Recomputes the cart hash and checks it against `cart_hash` in the merchant JWT
2. Checks JWT and cart expiry, chain id, and that `contract_address` is the mandate's token
3. Optionally checks that the ES256K signature recovers to a known merchant signer
4. Calls `spend(mandateId, amount, pay_to, category, ref = cartHash, hspOrderId = keccak256(paymentRequestId))`

The mandate rules engine decides, the same as for any other payment. A refusal still writes a receipt. On ALLOW, the receipt binds the on-chain transfer to the HSP payment request through `hspOrderId` and `ref`. Anyone can match a receipt to an HSP order by hashing the payment request id.

The HSP path does not bypass anything: the only way funds leave a mandate is `spend`, an approved exception, or a released escrow.

```ts
import { Lex, payHspCart, CATEGORIES } from "@lex/sdk";

const { check, receiptId } = await payHspCart(lex, 1n, cartMandate, {
  category: CATEGORIES.DATA,
  merchantSigner: "0xMerchantSigner", // optional
});
if (!check.ok) console.log(check.errors);
```

MCP tool: `pay_hsp_cart` takes `{ mandateId, cartMandate (JSON), category, merchantSigner? }`.

## Merchant side: an agent sells through HSP

`HspMerchant` wraps the HSP merchant API.

| Method | Call |
|--------|------|
| `buildCartMandate(...)` | Builds `contents` and signs `merchant_authorization` (ES256K, raw r‖s, base64url) |
| `createOrder(cart, redirectUrl?)` | `POST /api/v1/merchant/orders` with `{ cart_mandate, redirect_url }`. Returns `paymentRequestId`, `paymentUrl` |
| `getPaymentStatus(id)` | `GET /api/v1/merchant/payments?payment_request_id=` |
| `verifyWebhook(rawBody, signature)` | HMAC-SHA256 with the app secret, constant-time compare |

Requests are signed with these headers:

```
X-App-Key    app key
X-Timestamp  unix seconds
X-Nonce      32 hex chars
X-Signature  hex HMAC-SHA256(appSecret, METHOD\nPATH\nQUERY\nsha256(body)\nTIMESTAMP\nNONCE)
```

Payment states: `payment-required`, `payment-submitted`, `payment-verified`, `payment-processing`, `payment-safe`, `payment-included`, `payment-successful`, `payment-failed`.

## Agent-to-agent flow

1. Seller agent: `buildCartMandate` → `createOrder` → sends the cart to the buyer
2. Buyer agent: `payHspCart` through its Lex mandate → receipt with `hspOrderId`
3. Seller agent: `getPaymentStatus` or webhook → `payment-successful`, with a tx hash matching the Lex receipt's transaction

## Settlement rails

`Rules.preferredRail` records the owner's preference: `HSP`, `DIRECT`, or `HSP_THEN_DIRECT`. Both rails settle through the same `spend` path, so caps, windows, denylist and exceptions apply the same way. With `HSP_THEN_DIRECT`, an agent pays HSP carts when it has one and pays the counterparty directly otherwise.

## Configuration

```env
HSP_BASE_URL=https://merchant-qa.hashkeymerchant.com   # QA / testnet
HSP_APP_KEY=
HSP_APP_SECRET=
HSP_MERCHANT_NAME=
HSP_MERCHANT_PRIVATE_KEY=     # secp256k1 key that signs Cart Mandates
HSP_NETWORK=hashkey-testnet
```

Testnet (chain 133) tokens: USDC `0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6`, USDT `0x372325443233fEbaC1F6998aC750276468c83CC6`.

Merchant credentials come from the HashKey merchant platform.
