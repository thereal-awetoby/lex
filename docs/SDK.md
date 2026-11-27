# SDK

`@lex/sdk` is a TypeScript client for the Mandate contract, built on viem. It also contains the HSP rail.

It is not published to npm. Build it from the repo and depend on it by path, as the app and MCP server do:

```bash
cd sdk && npm install && npm run build
# in your package.json: "@lex/sdk": "file:../sdk"
```

## Setup

```ts
import { Lex } from "@lex/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const lex = new Lex({ mandateAddress: "0x..." });
lex.connect(
  createWalletClient({
    account: privateKeyToAccount(AGENT_KEY),
    chain: lex.publicClient.chain,
    transport: http("https://mainnet.hsk.xyz"),
  })
);
```

`new Lex({ mandateAddress, rpcUrl?, chain? })` defaults to HSK mainnet (chain 177, `https://mainnet.hsk.xyz`). Pass `chain` for testnet or a local node. One instance holds one wallet, so use one per key (owner, agent, approver).

- **Amounts** are in the token's smallest unit. USDC.e and USDT have 6 decimals: `parseUnits("2.5", 6)`.
- **Categories** are bytes32: `encodeCategory("compute")`, or `CATEGORIES.COMPUTE`.
- **Errors:** every write waits for its transaction and throws if it reverted. Reverts come from authorization or bad input, such as `NOT_AGENT`, `NOT_OWNER`, `HARD_LAW` or `TIMEOUT_REQUIRED`. A payment refused by the rules does not revert. It returns a receipt id, and the receipt records why it was refused.

## Reading

| Method | Returns |
|--------|---------|
| `getMandate(mandateId)` | `{ owner, paused, token, balance, policyHash, rules }` |
| `canSpend(mandateId, amount, counterparty, category)` | `{ ok, reasonCode, reason }`. A free view call that sends nothing |
| `canAgentSpend(mandateId, agent, amount, counterparty, category)` | Checks agent binding, heartbeat and sub-cap as well as mandate rules |
| `canSpendBatch(mandateId, items)` | Checks each item independently against current state |
| `getAgentCap(mandateId, agent)`, `getEnvelope(mandateId, category)` | Current cap/spend or envelope budget/spend/remaining |
| `getHeartbeat(mandateId, agent)`, `getGuardian(mandateId)` | Heartbeat status and guardian |
| `getPendingRuleChange(mandateId)` | Pending flag, effective time and rules |
| `getReceipt(receiptId)` | The receipt (see [RECEIPTS.md](RECEIPTS.md)) |
| `getException(exceptionId)` | amount, counterparty, category, reason, createdAt, approvalCount, resolved, approved |
| `getEscrow(escrowId)` | amount, token, counterparty, ref, state, lockedAt, timeout |
| `isAgentBound(mandateId, agent)` | `boolean` |
| `getSpendDecisions(mandateId, fromBlock?)` | `SpendDecision` logs, one per receipt |
| `getExceptionRequests(mandateId, fromBlock?)` | `ExceptionRequested` logs |

For the two log queries, pass the contract's deploy block as `fromBlock` rather than scanning from block 0.

## Owner

| Method | Notes |
|--------|-------|
| `createMandate({ rules, token, agents?, allowlist?, denylist?, approvers? })` | Returns `{ mandateId, txHash }`. The caller becomes the owner. A non-empty allowlist turns allowlisting on |
| `fund(mandateId, amount)` | Approves the token for exactly `amount`, waits for it, then funds |
| `withdraw(mandateId, amount)` | Returns unspent balance to the owner |
| `bindAgent(mandateId, agent)`, `revokeAgent(mandateId, agent)` | |
| `rotateAgent(mandateId, oldAgent, newAgent)` | One transaction |
| `setAllowlisted(mandateId, addr, allowed)` | Adding the first address turns allowlisting on for the mandate |
| `setDenylisted(mandateId, addr, denied)` | |
| `setCounterpartyTier(mandateId, counterparty, tier)` | Payments need `tier >= rules.minCounterpartyTier` |
| `addApprover(mandateId, approver)`, `removeApprover(mandateId, approver)` | |
| `setAgentCap(mandateId, agent, cap)` | Agent window sub-cap, 0 disables |
| `setEnvelope(mandateId, category, budget)` | Category total budget, 0 removes |
| `setHeartbeatPolicy(mandateId, seconds)` | 0 disables |
| `setGuardian(mandateId, guardian)` | Guardian may pause |
| `proposeRules(mandateId, rules)` | Applies at once if `timelockForRuleChange` is 0, otherwise queues the change |
| `executeRuleChange(mandateId)` | Applies a queued change once the timelock has passed |
| `cancelRuleChange(mandateId)` | Drops a queued change |
| `pause(mandateId)` | Owner or approver |
| `unpause(mandateId)` | Owner only |

## Agent

| Method | Notes |
|--------|-------|
| `spend(mandateId, amount, counterparty, category, ref?, hspOrderId?)` | Returns `{ receiptId, txHash }` for ALLOW and REFUSE alike |
| `payWithEscrow(mandateId, counterparty, amount, attestationSchemaId, ref, timeout)` | Note the order: counterparty comes before amount. Returns `{ escrowId?, receiptId, txHash }`. `escrowId` is undefined when refused. `timeout` is in seconds and must be above 0 |
| `attestEscrow(escrowId)` | Payer side (owner or agent) confirms delivery |
| `releaseEscrow(escrowId)` | After attestation. Owner, agent or counterparty |
| `refundEscrow(escrowId)` | After the timeout, if not attested. Anyone; funds return to the mandate |
| `requestException(mandateId, amount, counterparty, category, reason)` | Governed mandates only. Returns `{ exceptionId, txHash }` |
| `executeException(exceptionId, hspOrderId?)` | Once the time delay has passed and there is at least one approval. Owner, approver or agent |

## Spend intents

`buildSpendIntent` uses the connected agent wallet's next nonce and a default ten-minute deadline. `signSpendIntent` signs the EIP-712 data without a transaction. A relayer uses `canExecuteIntent` and `executeSpendIntent`; the latter returns `{ receiptId, txHash }`. A valid refusal consumes the nonce; an invalid or expired intent reverts. `getIntentNonce` reads the next nonce. The signing type is exported as `SPEND_INTENT_TYPES`.

An agent checks in via `heartbeat(mandateId)`.

The standalone `relaySpendIntent(url, intent, signature)` sends decimal-string integers to a relayer. Its result distinguishes `relayed` (a transaction was submitted) from `paid` (the relayer observed an ALLOW receipt). A dry-run refusal has no transaction; a mined refusal can still occur if state changes after the dry run. Verify the transaction and receipt independently before acting on an untrusted relayer's response. MCP performs that verification when the relayer reports a payment.

`startHeartbeat(mandateId, intervalMs, onError?)` sends one heartbeat immediately and schedules subsequent check-ins without overlap. It returns a stop function. Heartbeats are on-chain transactions and require gas; an intent relayer does not relay heartbeats.

## Approver

| Method | Notes |
|--------|-------|
| `approveException(exceptionId, hspOrderId?)` | Returns `{ receiptId, txHash }`. `receiptId` is set when this approval executes the exception |
| `rejectException(exceptionId)` | Owner or approver |

## Rules

```ts
interface MandateRules {
  perTxCap: bigint;                   // 0 = no cap (same for every cap below)
  rollingWindowCap: bigint;
  rollingWindowDuration: bigint;      // seconds; 0 = 86400
  perCounterpartyCap: bigint;         // per window
  perCategoryCap: bigint;             // per window
  cooldownSeconds: bigint;
  activeWindowStart: bigint;          // seconds after midnight UTC; both 0 = always active
  activeWindowEnd: bigint;            // may be earlier than start to wrap midnight
  minCounterpartyTier: bigint;        // 0 = off
  absoluteCeiling: bigint;            // largest single payment, exceptions included
  exceptionMode: ExceptionMode;       // HARD_LAW or GOVERNED
  preferredRail: SettlementRail;      // HSP, DIRECT or HSP_THEN_DIRECT; recorded, not enforced
  exceptionApprovalThreshold: number; // approvals needed to execute an exception
  exceptionTimeDelay: bigint;         // or: one approval plus this delay
  timelockForRuleChange: bigint;      // seconds a rule change waits before it can apply
}
```

If both `exceptionApprovalThreshold` and `exceptionTimeDelay` are 0, the owner's approval alone executes an exception.

## HSP

| Export | Notes |
|--------|-------|
| `payHspCart(lex, mandateId, cart, { category, merchantSigner?, allowUnverifiedMerchant?, decimals? })` | Checks the cart, then pays it through `spend`. Returns `{ check, receiptId?, txHash? }` |
| `checkCartMandate(cart, { chainId, token, merchantSigner?, allowUnverifiedMerchant?, decimals?, now? })` | Returns `{ ok, errors, paymentRequestId, payTo, token, chainId, amount, cartHash, hspOrderId }` |
| `hspOrderIdOf(paymentRequestId)` | The bytes32 stored on the receipt |
| `HspMerchant` | `buildCartMandate`, `createOrder`, `getPaymentStatus`, `verifyWebhook` |

Without `merchantSigner` a cart is rejected, unless `allowUnverifiedMerchant` is set. See [HSP.md](HSP.md).

## Constants

- `HSK_MAINNET`, `HSK_TESTNET`: `{ id, name, rpcUrl, explorerUrl, tokens: { USDC_E, USDT } }`
- `REASON_CODES`: code to name, listed in [RECEIPTS.md](RECEIPTS.md)
- `CATEGORIES`: `COMPUTE`, `DATA`, `FREELANCE`, `OTHER`, `ESCROW`
- `encodeCategory(name)`: same encoding as Solidity `bytes32("name")`, up to 32 bytes
- Enums: `ExceptionMode`, `Decision`, `SettlementRail`, `EscrowState`
- ABIs: `MANDATE_ABI`, `ERC20_ABI`, `FACTORY_ABI`

## Example

```ts
import { CATEGORIES, REASON_CODES } from "@lex/sdk";
import { parseUnits } from "viem";

const amount = parseUnits("2", 6);

const check = await lex.canSpend(1n, amount, payee, CATEGORIES.COMPUTE);
if (!check.ok) console.log("would be refused:", check.reason);

const { receiptId } = await lex.spend(1n, amount, payee, CATEGORIES.COMPUTE);
const receipt = await lex.getReceipt(receiptId);
console.log(["ALLOW", "REFUSE", "EXCEPTION"][receipt.decision], REASON_CODES[receipt.reasonCode]);
```
