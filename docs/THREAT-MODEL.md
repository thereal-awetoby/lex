# Threat Model

## Actors

| Actor | Trust Level | Keys |
|-------|------------|------|
| Owner | High — sets rules, funds mandates | EOA or multisig |
| Agent | Bounded — can only spend within mandate rules | Hot key, rotatable |
| Counterparty | Untrusted — receives funds | Any address |
| Approver | Medium — can approve exceptions in governed mode | EOA |

## Attack Surface

### 1. Agent Key Compromise

**Threat:** Attacker obtains agent private key.

**Mitigations:**
- Per-tx cap limits single-transaction damage
- Rolling window cap limits damage over time
- Absolute ceiling is the hard upper bound — cannot be exceeded even through exceptions
- Denylist blocks known-bad addresses regardless of agent intent
- Cooldown prevents rapid-fire drain
- Owner can `revokeAgent` immediately
- `rotateAgent` atomically swaps to a new key

**Residual risk:** Attacker can spend up to rolling cap before owner notices. Active monitoring recommended.

### 2. Rule Bypass via Exception

**Threat:** Agent requests exception to circumvent caps.

**Mitigations:**
- HARD_LAW mandates have no exception path at all
- GOVERNED mandates require N-of-M approver signatures or time-delay
- Exceptions cannot override denylist (denylisted counterparties always refuse)
- Exceptions cannot exceed absolute ceiling
- Every exception is logged on-chain with full audit trail

### 3. Denylist Circumvention

**Threat:** Agent sends funds to a denylisted address through an intermediary.

**Mitigations:**
- On-chain denylist enforced at the contract level — no code path bypasses it
- Even governed exceptions cannot override denylist
- Counterparty tier requirements can restrict to known addresses only
- Allowlist mode (requireAllowlist) limits to explicitly approved counterparties

**Residual risk:** Intermediary addresses not on denylist. Owner must maintain lists proactively.

### 4. Malicious Rule Change

**Threat:** Compromised owner key changes rules to remove caps.

**Mitigations:**
- `timelockForRuleChange` on rule changes — agents and observers see proposed changes before they activate
- Owner can cancel pending rule changes
- All rule changes emit events for off-chain monitoring
- Approvers can be required for rule execution

### 5. Token Drain via Escrow

**Threat:** Attacker locks funds in escrow and never completes.

**Mitigations:**
- Escrow has timeout — refund returns funds to mandate balance after deadline
- Owner can force refund at any time
- Escrow creation runs the same canSpend checks as direct spend
- Escrow funds are tracked separately from available balance

### 6. Front-running / MEV

**Threat:** Validator reorders transactions to extract value.

**Mitigations:**
- Spend transactions go to known counterparties, not AMMs — limited MEV opportunity
- Rolling window and cooldown make rapid exploitation harder
- HSK Chain uses a validator set with known operators

### 7. Reentrancy

**Threat:** Malicious token or counterparty contract reenters during transfer.

**Mitigations:**
- State updates (balance, counters, receipt) happen before token transfer (checks-effects-interactions)
- ERC20 transfers are the last operation in spend and escrow release

## Invariants

1. **No spend without receipt.** Every call to `spend()` produces a Receipt — ALLOW or REFUSE.
2. **Denylist is absolute.** No code path (spend, exception, escrow) transfers tokens to a denylisted address.
3. **Absolute ceiling holds.** Total spent by a mandate never exceeds `absoluteCeiling`, even through exceptions.
4. **Agent scope.** Only bound agents can call `spend()`. Only the owner can bind/revoke agents.
5. **Balance integrity.** `mandate.balance + sum(escrow.locked) + sum(transferred) == sum(funded)`.

## Recommendations

- Use HARD_LAW for autonomous agents in production
- Set `timelockForRuleChange` > 0 for any mandate with significant funds
- Monitor `SpendDecision` events off-chain for anomaly detection
- Rotate agent keys periodically via `rotateAgent`
- Keep denylist updated with known-bad addresses
- Use allowlist mode for high-value mandates
