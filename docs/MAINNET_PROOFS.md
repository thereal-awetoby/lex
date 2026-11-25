# Mainnet Proofs

## Network

- Chain: HashKey Chain (ID 177)
- RPC: https://mainnet.hsk.xyz
- Explorer: https://hashkeyscan.io
- Tokens: USDC.e (`0x054ed45810DbBAb8B27668922D110669c9D88D0a`), USDT (`0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029`)

## Generating Proofs

Run the exercise script against mainnet:

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export AGENT_PRIVATE_KEY=0x...
export LEX_MANDATE_ADDRESS=0x...
export TOKEN_ADDRESS=0x054ed45810DbBAb8B27668922D110669c9D88D0a

npx tsx scripts/exercise-mainnet.ts
```

This executes the full lifecycle on mainnet and writes `docs/mainnet-proofs.json`.

## Proof Steps

The script executes these steps and records tx hashes:

1. **Create Mandate** — deploys mandate with rules (5 USDC.e per-tx cap, 50 rolling, hard law)
2. **Fund Mandate** — approves token + funds 10 USDC.e
3. **canSpend Pre-flight** — view call verifying the spend would be allowed
4. **Agent Spend** — agent executes 2 USDC.e spend, receipt produced
5. **Verify Receipt** — reads receipt on-chain, confirms decision = ALLOW

## Deployed Contracts

_Fill after deployment:_

| Contract | Address | Tx Hash |
|----------|---------|---------|
| MandateFactory | | |
| Mandate | | |

## Proof Transactions

_Fill after running exercise-mainnet.ts:_

| Step | Tx Hash | Block | Explorer |
|------|---------|-------|----------|
| Create Mandate | | | |
| Fund | | | |
| Spend | | | |

## Verification

Anyone can verify:

1. Receipt on-chain: call `getReceipt(receiptId)` on the Mandate contract
2. Transaction on explorer: paste tx hash at https://hashkeyscan.io
3. Public verify page: `/r/:receiptId` on the deployed app
