# Threat Model

## Actors

The owner controls rules, funding, withdrawal, lists, agent bindings and direct limits. Agents have scoped payment powers and can sign intents. Approvers can approve or reject exceptions and pause; a guardian can pause. A relayer can submit a signed intent and pay gas. Counterparties receive funds and can release an attested escrow.

## Threats and limitations

- **Compromised agent:** caps, allowlists, tiers, the denylist, and pause/revoke limit damage. A compromised key can still pay within its limits and send heartbeats. Monitor decisions and use separate agent keys.
- **Exceptions:** governed exceptions may override soft limits. Paused status, denylist, ceiling, envelope, agent binding, sub-cap, heartbeat and balance are checked at execution. Hard law has no exception path.
- **Signed intents:** the signature binds the payment, chain, contract, nonce and deadline. A relayer can choose when to submit before expiry. A valid refusal consumes the nonce; use short deadlines. An intent left unsubmitted during revocation may become usable again if the same key is rebound before expiry.
- **App relayer gas:** the endpoint is unauthenticated, has no built-in rate limit and accepts any mandate unless `RELAY_MANDATE_IDS` restricts it. A bound agent can submit many valid small payments and drain the sponsor's gas. Protect it with external authentication/rate limits where appropriate, restrict mandates and use a dedicated key with a small balance. A dry run is not a guarantee: state may change before mining, causing a paid-for refusal or revert. Clients must verify the mined decision and transaction.
- **Category labels:** the agent selects the category and can choose another to evade an envelope. Use counterparties, per-agent and total limits as independent controls.
- **Owner compromise:** the owner can withdraw funds and change lists and direct limits; the rule-change timelock does not protect these actions. Use an appropriate multisig and monitor updates.
- **Escrow:** the owner or any bound agent can attest delivery; a counterparty that also holds either role can attest its own escrow. A refund is available only after timeout. Escrow release does not recheck a denylist added after lock. Refunded locks still count against window limits and agent caps.
- **Token behavior:** accounting assumes the requested token amount is transferred. Fee-on-transfer, rebasing or callback-capable tokens can break assumptions. Effects before interactions are not a general reentrancy defense. Use only appropriate tokens and seek an independent security review.
- **Public pages:** agent and envelope lists depend on complete event history from the configured deploy block and RPC log availability; they are not authoritative if logs are missing. Receipt and mandate IDs are unique only within the contract deployment.

The code is not represented as audited or production-ready.
