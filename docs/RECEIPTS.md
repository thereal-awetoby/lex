# Receipts

Every spend decision produces an on-chain receipt — whether the spend was allowed or refused.

## Receipt Structure

```solidity
struct Receipt {
    uint256 receiptId;
    uint256 mandateId;
    bytes32 policyHash;
    Decision decision;      // ALLOW (0), REFUSE (1), EXCEPTION (2)
    uint16 reasonCode;      // 0-14, see reason codes
    uint256 amount;
    address token;
    address counterparty;
    bytes32 category;
    bytes32 ref;            // invoice / order id hash
    uint256 exceptionId;    // 0 for normal spends
    bytes32 hspOrderId;     // HSP order id (0x0 if unused)
    bytes32 txRef;          // reserved
    uint256 timestamp;
}
```

`policyHash` is `keccak256(abi.encode(mandateId, rules))` captured at decision time, so auditors can verify exactly which ruleset governed a spend.

## Decision Types

| Decision | Meaning |
|----------|---------|
| ALLOW | Spend executed within mandate rules |
| REFUSE | Spend blocked by a rule violation |
| EXCEPTION | Spend executed via approved exception (governed mandates) |

## Reason Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | All rules passed |
| 1 | PAUSED | Mandate is paused |
| 2 | OVER_TX_CAP | Amount exceeds per-transaction cap |
| 3 | OVER_ROLLING | Would exceed rolling window cap |
| 4 | NOT_ALLOWLISTED | Counterparty not on allowlist (when required) |
| 5 | DENYLISTED | Counterparty is denylisted |
| 6 | TIER_TOO_LOW | Counterparty tier below minimum |
| 7 | COOLDOWN | Too soon since last spend |
| 8 | WINDOW_CLOSED | Outside active time window |
| 9 | EXCEPTION_REQUIRED | Governed mandate, needs exception approval |
| 10 | OVER_COUNTERPARTY_CAP | Would exceed per-counterparty cap |
| 11 | OVER_CATEGORY_CAP | Would exceed per-category cap |
| 12 | OVER_ABSOLUTE_CEILING | Would exceed absolute ceiling |
| 13 | AGENT_NOT_BOUND | Caller is not a bound agent |
| 14 | INSUFFICIENT_FUNDS | Mandate balance too low |

Note: reason code **9** is emitted on a REFUSE when a governed mandate blocks a spend that *could* be escalated to an exception. Codes 12 (absolute ceiling) and 14 (insufficient funds) are never escalated to exceptions.

## Querying Receipts

### On-chain

```solidity
function getReceipt(uint256 receiptId) external view returns (Receipt memory);
```

### SDK

```typescript
const receipt = await lex.getReceipt(receiptId);
```

### Events

```solidity
event SpendDecision(
    uint256 indexed mandateId,
    uint256 indexed receiptId,
    uint8 decision,
    uint16 reasonCode,
    uint256 amount,
    address counterparty,
    bytes32 category
);
```

Filter by `mandateId` (or `receiptId`) to track all decisions:

```typescript
const logs = await lex.getSpendDecisions(1n);
```

### MCP Server

```
Tool: get_receipt
Args: { receiptId: "1" }
```

## Public Verification

Receipts are publicly verifiable at:

```
/r/:receiptId
```

The verify page shows:

- Decision (color-coded: green=ALLOW, red=REFUSE, yellow=EXCEPTION)
- All receipt fields
- Link to transaction on HashKeyScan
- Link to the governing mandate

Anyone with a receipt ID can independently verify the spend decision — no authentication required.

## Audit Trail

The receipt system guarantees:

1. Every `spend()` call produces a receipt, whether allowed or refused
2. REFUSE receipts document why a spend was blocked (with `reasonCode`)
3. EXCEPTION receipts link back to the exception approval chain (`exceptionId`)
4. `policyHash` ties each decision to the exact rules in effect
5. All receipts are immutable and on-chain
