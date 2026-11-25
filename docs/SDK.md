# SDK Reference

## Install

```bash
npm install @lex/sdk
```

The SDK depends on `viem` (peer dependency).

## Quick Start

```typescript
import { Lex } from "@lex/sdk";

// Read-only
const lex = new Lex({ mandateAddress: "0xMandateContractAddress" });
const mandate = await lex.getMandate(1n);
const { allowed, reasonCode } = await lex.canSpend(1n, amount, counterparty, category);

// With wallet (write ops)
lex.connect(walletClient);
const mandateId = await lex.createMandate({ rules, token, agents, allowlist, denylist, approvers });
await lex.fund(mandateId, parseUnits("100", 6));
const receiptId = await lex.spend(mandateId, amount, counterparty, category, ref, hspOrderId);
```

## Constructor

```typescript
new Lex({
  mandateAddress: string;   // deployed Mandate contract (required)
  rpcUrl?: string;         // default: https://mainnet.hsk.xyz
  chain?: Chain;           // default: HSK mainnet (chain ID 177)
})
```

## Read Methods

### `getMandate(mandateId: bigint)`

Returns the full mandate state: owner, paused, token, balance, policyHash, rules.

### `canSpend(mandateId, amount, counterparty, category)`

Pre-flight check. Returns `{ ok: boolean, reasonCode: number, reason: string }`.

> Argument order is `(mandateId, amount, counterparty, category)` — the same order as the on-chain `canSpend`.

Reason codes:

| Code | Meaning |
|------|---------|
| 0 | OK |
| 1 | PAUSED |
| 2 | OVER_TX_CAP |
| 3 | OVER_ROLLING |
| 4 | NOT_ALLOWLISTED |
| 5 | DENYLISTED |
| 6 | TIER_TOO_LOW |
| 7 | COOLDOWN |
| 8 | WINDOW_CLOSED |
| 9 | EXCEPTION_REQUIRED |
| 10 | OVER_COUNTERPARTY_CAP |
| 11 | OVER_CATEGORY_CAP |
| 12 | OVER_ABSOLUTE_CEILING |
| 13 | AGENT_NOT_BOUND |
| 14 | INSUFFICIENT_FUNDS |

### `getReceipt(receiptId: bigint)`

Returns the full receipt (see `docs/RECEIPTS.md` for the field layout).

### `getException(exceptionId: bigint)`

Returns exception request state.

### `getEscrow(escrowId: bigint)`

Returns escrow state: mandate ID, counterparty, amount, state (LOCKED/ATTESTED/RELEASED/REFUNDED), deadline.

### `isAgentBound(mandateId, agent)`

Returns boolean.

### `getSpendDecisions(mandateId, fromBlock?)`

Queries `SpendDecision` events. Options: `fromBlock` (default 0n).

## Write Methods

All write methods require `connect(walletClient)` first. They return the relevant ID (mandate ID, receipt ID, etc.) after waiting for the transaction receipt.

### `createMandate({ rules, token, agents, allowlist, denylist, approvers })`

Creates a new mandate. Caller becomes owner.

### `fund(mandateId, amount)`

Funds a mandate. Automatically approves the token transfer first.

### `spend(mandateId, amount, counterparty, category, ref, hspOrderId)`

Agent-only. Executes a spend through the rules engine. Returns `{ receiptId, txHash }`.

> Argument order is `(mandateId, amount, counterparty, category, ref, hspOrderId)`.

### `bindAgent(mandateId, agent)` / `revokeAgent(mandateId, agent)`

Owner-only. Manage bound agents.

### `rotateAgent(mandateId, oldAgent, newAgent)`

Owner-only. Atomic swap of agent address.

### `setAllowlisted(mandateId, addr, status)` / `setDenylisted(mandateId, addr, status)`

Owner-only. Manage address lists.

### `proposeRules(mandateId, newRules)`

Owner-only. Proposes a rule change. If `timelockForRuleChange == 0`, executes immediately; otherwise call `executeRuleChange` after the timelock.

### `pause(mandateId)` / `unpause(mandateId)`

Owner-only. Emergency pause/resume.

### `requestException(mandateId, amount, counterparty, category, reason)`

Agent-only. Governed mandates only. Requests an exception for a spend that would otherwise be refused.

### `approveException(exceptionId, hspOrderId?)`

Approver-only. Approves an exception. If threshold met, executes the spend and returns `{ receiptId, txHash }`.

### `rejectException(exceptionId)`

Owner or approver. Rejects an exception.

### `payWithEscrow(mandateId, counterparty, amount, attestationSchemaId, ref, timeout)`

Agent-only. Locks funds in escrow pending attestation.

### `withdraw(mandateId, amount)`

Owner-only. Withdraws unspent funds.

## Constants

```typescript
import { REASON_CODES, CATEGORIES, encodeCategory, HSK_MAINNET, HSK_TESTNET } from "@lex/sdk";

// REASON_CODES: Record<number, string>
// CATEGORIES: { COMPUTE, DATA, FREELANCE, OTHER, ESCROW }
// encodeCategory("compute") => bytes32
// HSK_MAINNET: { id: 177, ... }
```

## Token Addresses (HSK Mainnet)

```
USDC.e: 0x054ed45810DbBAb8B27668922D110669c9D88D0a
USDT:   0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029
```

Both are 6 decimals.
