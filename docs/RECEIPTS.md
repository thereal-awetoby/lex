# Receipts

A receipt is the on-chain record of one spend decision. Receipts are stored in the Mandate contract and cannot be changed or deleted.

## When a receipt is written

| Call | Decision |
|------|----------|
| `spend` by a bound agent | ALLOW or REFUSE |
| `executeSpendIntent` with a valid intent | ALLOW or REFUSE |
| `payWithEscrow` by a bound agent | ALLOW (funds locked) or REFUSE (nothing locked) |
| An exception executes, through `approveException` reaching its threshold or `executeException` | EXCEPTION |

A refusal is a normal outcome: the transaction succeeds and the receipt records the reason. No receipt is written when a call reverts. That happens when the caller is not a bound agent (`NOT_AGENT`), when an escrow has no timeout (`TIMEOUT_REQUIRED`), or when a token transfer fails. Releasing or refunding an escrow does not write a receipt. It emits `EscrowReleased` or `EscrowRefunded`.

Receipt ids are unique across all mandates.

## Fields

```solidity
struct Receipt {
    uint256 receiptId;
    uint256 mandateId;
    bytes32 policyHash;   // keccak256(abi.encode(mandateId, rules)) when the decision was made
    Decision decision;    // ALLOW, REFUSE or EXCEPTION
    uint16 reasonCode;    // 0 unless REFUSE
    uint256 amount;
    address token;
    address counterparty;
    bytes32 category;     // e.g. bytes32("compute"); "escrow" for escrow locks
    bytes32 ref;          // caller's reference; the cart hash for HSP payments
    uint256 exceptionId;  // set on EXCEPTION receipts
    bytes32 hspOrderId;   // keccak256 of the HSP payment request id, for HSP payments
    bytes32 txRef;        // escrow id on escrow-lock receipts, otherwise 0
    uint256 timestamp;
    address agent;        // the agent whose payment was decided
}
```

## Reason codes

Rules are checked in the order below, and the first rule that fails is the reason.

| Code | Name | Meaning | Exception possible |
|------|------|---------|--------------------|
| 0 | OK | All rules passed | |
| 1 | PAUSED | The mandate is paused | No |
| 5 | DENYLISTED | The counterparty is denylisted | No |
| 12 | OVER_ABSOLUTE_CEILING | Above the largest payment the mandate allows | No |
| 16 | ENVELOPE_EXCEEDED | Category budget exceeded | No |
| 17 | AGENT_HEARTBEAT_STALE | Agent check-in is stale | No |
| 15 | OVER_AGENT_CAP | Agent window sub-cap exceeded | No |
| 2 | OVER_TX_CAP | Above the per-payment cap | Yes |
| 3 | OVER_ROLLING | Would exceed the rolling window cap | Yes |
| 4 | NOT_ALLOWLISTED | Allowlisting is on and the counterparty is not on it | Yes |
| 6 | TIER_TOO_LOW | The counterparty's tier is below the minimum | Yes |
| 10 | OVER_COUNTERPARTY_CAP | Would exceed the per-counterparty cap for the window | Yes |
| 11 | OVER_CATEGORY_CAP | Would exceed the per-category cap for the window | Yes |
| 7 | COOLDOWN | Too soon after the last payment | Yes |
| 8 | WINDOW_CLOSED | Outside the mandate's active hours | Yes |
| 14 | INSUFFICIENT_FUNDS | Not enough balance | No |
| 9 | EXCEPTION_REQUIRED | Governed mandate: refused, and an exception can be requested | |
| 13 | AGENT_NOT_BOUND | Reserved. A spend from an unbound caller reverts with `NOT_AGENT`, so no receipt carries this code | |

`canSpend` checks mandate rules; `canAgentSpend` additionally checks binding, heartbeat and agent sub-cap. `canExecuteIntent` also checks signature, nonce and deadline. Expired and used intents revert on execution (view codes 18 and 19). A valid refused intent consumes its nonce.

In a governed mandate, a refusal that an exception could override is recorded as 9 rather than its own code. `canSpend` with the same inputs returns the specific rule. Escrow has no exception path, so a refused escrow always records the specific rule.

## Policy hash

`policyHash` identifies the exact rules a decision was made under. To check it, read the mandate's rules, compute `keccak256(abi.encode(mandateId, rules))`, and compare. Every rule change emits `RulesUpdated(mandateId, newPolicyHash)`, so an older hash can be matched to the change that introduced it.

Sub-caps, envelopes, heartbeat policy, tiers and lists are not included in the policy hash. Their updates emit separate events. A soft-rule refusal can mask insufficient balance in the dry run; exception execution still checks balance.

## Events

```solidity
event SpendDecision(
    uint256 indexed mandateId,
    uint256 indexed receiptId,
    Decision decision,
    uint16 reasonCode,
    uint256 amount,
    address counterparty,
    bytes32 category
);
event ExceptionSpend(uint256 indexed mandateId, uint256 indexed exceptionId, uint256 indexed receiptId);
event EscrowLocked(uint256 indexed mandateId, uint256 indexed escrowId, uint256 amount);
```

There is one `SpendDecision` per receipt. Filtering by `receiptId` finds the transaction that wrote a receipt, which is how the app links it on HashKey Scan.

## Reading receipts

- Contract: `getReceipt(receiptId)`
- SDK: `lex.getReceipt(receiptId)`, `lex.getSpendDecisions(mandateId)`
- MCP: `get_receipt`, `list_receipts`
- App: `/r/:receiptId` for one receipt, `/m/:mandateId` for every decision of a mandate. No wallet needed.
