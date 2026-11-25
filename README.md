# Lex

On-chain spending law for AI agents on HashKey Chain.

Portable mandates with non-bypassable enforcement, dual settlement rails (HSP + direct), and receipts for every decision.

## Architecture

```
contracts/     Foundry — Solidity 0.8.24
  src/
    Mandate.sol          Single contract, mandate-ID pattern
    MandateFactory.sol   Deploys the Mandate contract
    interfaces/          IMandate.sol, IERC20.sol
    mocks/               MockERC20.sol (test only)
  test/
    Mandate.t.sol        Unit + fuzz + invariant tests

sdk/           TypeScript SDK (viem)
  src/
    index.ts             Lex class — read + write methods
    abi.ts               Contract ABIs
    constants.ts         Chain defs, reason codes, categories

mcp/           MCP server for AI agent integration
  src/
    server.ts            8 tools: get_mandate, can_pay, pay, ...

app/           Next.js owner console + public verify pages
  src/
    app/
      page.tsx           Create / manage mandates
      r/[receiptId]/     Public receipt verification
      m/[mandateId]/     Public mandate summary
    components/          ConnectWallet, CreateMandate, MandateView
    hooks/               useMandate, useCanSpend, useReceipt, ...
    config/              wagmi, contracts

scripts/       Deploy + exercise scripts
docs/          THREAT-MODEL, HSP, SDK, RECEIPTS, DEMO, MAINNET_PROOFS
```

## Rules Engine

Each mandate enforces:

- Per-transaction cap
- Rolling 24h window cap
- Per-counterparty cap
- Per-category cap
- Cooldown between spends
- Active time windows (with midnight wrap)
- Allowlist / denylist
- Minimum counterparty tier
- Absolute ceiling (hard upper bound)

Exception model: **Hard Law** (no exceptions) or **Governed** (N-of-M approval / time-delay).

Denylist is absolute — no code path, including exceptions, can send funds to a denylisted address.

## Receipts

Every spend decision produces an on-chain receipt — ALLOW, REFUSE, or EXCEPTION — with the full context: amount, counterparty, reason code, rule hash, settlement rail.

Public verification at `/r/:receiptId` — no auth required.

## Settlement

- **Direct**: ERC-20 transfer on-chain (USDC.e / USDT)
- **HSP**: HashKey Payment gateway (event interface defined, pending gateway access)
- **HSP then Direct**: try HSP, fall back to direct

## Escrow

Lock → Attest → Release | Refund. Same rules engine applies at lock time. Timeout-based refund returns funds to mandate.

## Network

- Chain: HashKey Chain (ID 177)
- RPC: https://mainnet.hsk.xyz
- Explorer: https://hashkeyscan.io
- USDC.e: `0x054ed45810DbBAb8B27668922D110669c9D88D0a`
- USDT: `0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029`

## Quick Start

```bash
# Contracts
cd contracts && forge build && forge test -vvv

# SDK
cd sdk && npm install

# MCP server
cd mcp && npm install

# Owner console
cd app && npm install && npm run dev

# Deploy
cp .env.example .env  # fill in keys
cd contracts
forge create src/MandateFactory.sol:MandateFactory \
  --rpc-url $HSK_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

See [docs/DEMO.md](docs/DEMO.md) for the full walkthrough.

## Docs

- [Threat Model](docs/THREAT-MODEL.md)
- [HSP Integration](docs/HSP.md)
- [SDK Reference](docs/SDK.md)
- [Receipts](docs/RECEIPTS.md)
- [Demo Walkthrough](docs/DEMO.md)
- [Mainnet Proofs](docs/MAINNET_PROOFS.md)

## License

MIT
