# Mainnet Proofs

## Network

- Chain: HashKey Chain, ID 177
- RPC: https://mainnet.hsk.xyz
- Explorer: https://hashkeyscan.io
- Token: USDC.e `0x054ed45810DbBAb8B27668922D110669c9D88D0a` (6 decimals)

## Deployed contracts

| Contract | Address | Deploy tx |
|----------|---------|-----------|
| MandateFactory | | |
| Mandate | | |

Deploy block:

## What the proof run does

`scripts/exercise-mainnet.ts` runs against the deployed Mandate contract. It reads each receipt back from the chain and checks it against the expected decision. If any decision differs, it exits with an error.

1. Creates a hard-law mandate: 1 per payment, 5 per 24h, absolute ceiling 2, the counterparty allowlisted, `0x…dEaD` denylisted. Funds it with 3.
2. Agent pays 0.5: **ALLOW**.
3. Agent pays 1.5: **REFUSE**, `OVER_TX_CAP`.
4. Agent pays the denylisted address: **REFUSE**, `DENYLISTED`.
5. Owner pauses. Agent pays: **REFUSE**, `PAUSED`. Owner unpauses.
6. Agent locks 0.5 in escrow (**ALLOW** receipt), attests delivery, and the escrow is released to the counterparty.
7. Agent pays a 0.25 HSP Cart Mandate through `payHspCart`: **ALLOW**. The run checks that the receipt carries the HSP order id. The cart is signed by the owner key acting as merchant, and no HSP merchant API call is made.
8. Creates a governed mandate where exceptions need 1 approval. Funds it with 2. Agent pays 1.5: **REFUSE**, `EXCEPTION_REQUIRED`. Agent requests an exception, the owner approves, and it pays out: **EXCEPTION**.
9. Owner withdraws what is left in both mandates.

The owner key needs 5 USDC.e and HSK for gas. The agent key needs HSK for gas. By default the counterparty is the owner, so paid amounts come back and the run costs gas. A different counterparty receives the payments. If the run stops early, unspent mandate balances may need to be withdrawn separately.

```bash
npm install
# Enter keys privately; use dedicated, appropriately funded accounts.
read -rs -p 'Owner private key: ' DEPLOYER_PRIVATE_KEY; echo
read -rs -p 'Agent private key: ' AGENT_PRIVATE_KEY; echo
export DEPLOYER_PRIVATE_KEY AGENT_PRIVATE_KEY
# Replace with the deployed Mandate address before running.
export LEX_MANDATE_ADDRESS=0x...
HSK_RPC_URL=https://mainnet.hsk.xyz npm run exercise
```

The script also supports testnet (chain 133) and local nodes; set `TOKEN_ADDRESS` for a local token. `APP_URL` and `COUNTERPARTY` are optional. A local or testnet run is not a mainnet proof; only record actual chain 177 results below. App receipt links require an app configured for the same chain and Mandate contract.

## Results

*Paste the table printed by a mainnet run here. No mainnet proof has been recorded yet.*

## Verify

- Any receipt: call `getReceipt(id)` on the Mandate contract, or open `/r/:id` in the app.
- Any transaction: https://hashkeyscan.io.
- A mandate's rules and decision history: `/m/:id` in the app, subject to the app's configured deployment block and RPC log availability.
