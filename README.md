# Lex

Spending mandates for AI agents on HashKey Chain.

An owner funds a mandate with a token such as USDC.e or USDT and binds one or more agent keys to it. Agents can make payments from the mandate contract under the owner's rules. Authorized spend attempts that fail a policy check produce on-chain refusal receipts.

Payments settle through ERC-20 transfers. The SDK also checks HSP (HashKey Settlement Protocol) Cart Mandates and pays them through the same `spend` path.

## How enforcement works

Funds sit in the Mandate contract, not in the agent's wallet. There are four ways for them to leave:

| Path | Who calls | Checked against |
|------|-----------|-----------------|
| `spend` | bound agent | spend rules |
| approved exception | owner, approvers, or a bound agent when executing a delayed exception | paused status, denylist, absolute ceiling, balance |
| escrow release | owner, counterparty or bound agent, after payer-side attestation | spend rules are checked when the escrow is locked |
| `withdraw` | owner | unspent mandate balance; sent to owner |

Exception execution can override the other spend rules, including the minimum counterparty tier. Escrow release does not re-check rules changed after the lock.

## Rules

Each mandate stores:

- Per-payment cap
- Rolling window cap (default 24h)
- Per-counterparty cap and per-category cap, per window
- Cooldown between payments
- Active hours (UTC, can wrap midnight)
- Allowlist and denylist
- Minimum counterparty tier (owner assigns tiers per counterparty)
- Absolute ceiling: the largest single payment possible, even through an exception
- Rule changes can be timelocked; the owner can update lists and tiers independently

`canSpend(mandateId, amount, counterparty, category)` is a free view call that returns whether the rules allow a payment and a reason code. It does not check whether a caller is a bound agent.

Additional controls include per-agent rolling sub-caps, category envelopes, a heartbeat policy, and a pause-only guardian. `canAgentSpend` includes agent binding, sub-cap, and heartbeat; `canSpendBatch` checks each item independently. `canExecuteIntent` checks a signed EIP-712 intent, including its signer, nonce, and deadline. Intents use the `LexMandate` version `1` domain and are bound to the chain and contract. A valid intent consumes its nonce even if policy refuses it.

A category is chosen by the agent, so an envelope cannot prevent a compromised agent from using a different category. Sub-caps, envelopes, lists, tiers, and heartbeat policies are not included in `policyHash` and are not covered by the rules timelock.

## Exceptions

- **Hard law:** no exceptions.
- **Governed:** an agent can request an exception. It executes after the configured approval threshold, or after one approval plus a configured time delay, or on the owner's approval if neither is set. Paused status, denylist, absolute ceiling and balance are checked again at execution time.

## Receipts

An authorized `spend` that reaches the policy check writes a receipt for an allowed or refused decision. A paused mandate records `REFUSE / PAUSED`. Executed exceptions and escrow locks also write receipts. Calls can still revert, for example on authorization or token transfer failure; a refused escrow lock reverts rather than writing a refusal receipt.

Receipt, exception and escrow IDs are unique across mandates within one Mandate contract. A receipt includes a hash of the `Rules` struct, not the separately managed allowlist, denylist or counterparty tiers.

Public pages, no wallet needed:

- `/r/:receiptId`: receipt details and the transaction on HashKey Scan, when its event is found
- `/m/:mandateId`: rules, a `canSpend` payment checker, and decision activity

## Escrow

`payWithEscrow` locks funds for a counterparty under the same spend rules as a direct payment.

- The owner or a bound agent can attest delivery. A counterparty that also holds one of these roles can attest its own escrow.
- An attested escrow can be released to the counterparty.
- An unattested escrow can be refunded to the mandate after its timeout; it cannot be refunded before then.

## HSP

- **Paying:** `payHspCart` checks the cart hash, ES256K signature against a supplied signer, expiry, chain and token, then pays through `spend`. An explicit unverified mode exists for testing. The MCP server restricts signer selection to an operator-configured trusted list.
- **Selling:** `HspMerchant` signs Cart Mandates, creates orders through the HSP merchant API, checks payment status, and verifies webhooks. Integration with the merchant API has not been verified here.

See [docs/HSP.md](docs/HSP.md).

## Components

```
contracts/   Solidity 0.8.24, Foundry. Mandate.sol, MandateFactory.sol, tests
sdk/         TypeScript SDK (viem): Lex client and HSP helpers
mcp/         MCP server for agents to check payments, spend, request exceptions and use escrow
app/         Next.js owner console and public receipt and mandate pages
scripts/     deploy and exercise scripts
docs/        threat model, HSP, SDK, receipts, demo, mainnet proofs
```

MCP tools: `get_mandate`, `can_pay`, `can_agent_spend`, `heartbeat`, `pay`, `pay_hsp_cart`, `request_exception`, `execute_exception`, `pay_escrow`, `attest_escrow`, `release_escrow`, `get_receipt`, `list_receipts`, `get_exception`, `get_escrow`.

## Network

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 177 | 133 |
| RPC | https://mainnet.hsk.xyz | https://testnet.hsk.xyz |
| Explorer | https://hsk.blockscout.com | https://testnet-explorer.hskchain.net |
| USDC.e / USDC | `0x054ed45810DbBAb8B27668922D110669c9D88D0a` | `0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6` |
| USDT | `0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029` | `0x372325443233fEbaC1F6998aC750276468c83CC6` |

[docs/MAINNET_PROOFS.md](docs/MAINNET_PROOFS.md) describes how to generate proofs; its deployment and transaction tables have not been filled in.

## Run it

```bash
# contracts
cd contracts
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std
forge test -vvv

# deploy (configure the key locally; never share it)
export DEPLOYER_PRIVATE_KEY=0x...
forge script script/Deploy.s.sol --rpc-url https://mainnet.hsk.xyz --broadcast

# sdk, then app
cd ../sdk && npm install && npm run build
cd ../app && npm install && npm run dev

# mcp server
cd ../mcp && npm install
LEX_MANDATE_ADDRESS=0x... LEX_AGENT_PRIVATE_KEY=0x... npx tsx src/server.ts
```

Environment variables are listed in `.env.example`. CI builds and tests the contracts, type-checks the SDK, and builds the app on every push.

## Docs

- [Threat model](docs/THREAT-MODEL.md)
- [HSP](docs/HSP.md)
- [SDK](docs/SDK.md)
- [Receipts](docs/RECEIPTS.md)
- [Demo](docs/DEMO.md)
- [Mainnet proofs](docs/MAINNET_PROOFS.md)

## License

MIT
