# Mainnet Proofs

## Network

- Chain: HashKey Chain, ID 177
- RPC: https://mainnet.hsk.xyz
- Explorer: https://hsk.blockscout.com
- Token: USDC.e `0x054ed45810DbBAb8B27668922D110669c9D88D0a` (6 decimals)

## Deployed contracts

| Contract | Address | Deploy tx | Source verified |
|----------|---------|-----------|-----------------|
| MandateFactory | | | |
| Mandate | | | |

Deploy block:

To deploy and verify on Blockscout, from `contracts` (use the exact source and Foundry compiler settings used for deployment, including CBOR metadata settings):

```bash
forge script script/Deploy.s.sol --rpc-url https://mainnet.hsk.xyz --broadcast \
  --verify --verifier blockscout --verifier-url https://hsk.blockscout.com/api/
# If the child contract is not verified automatically:
forge verify-contract <MANDATE_ADDRESS> src/Mandate.sol:Mandate --rpc-url https://mainnet.hsk.xyz \
  --verifier blockscout --verifier-url https://hsk.blockscout.com/api/
```

## What the proof run does

`scripts/exercise-mainnet.ts` runs against a Mandate contract deployed from the current code. Older deployments that revert on refused escrow need to be redeployed for this exercise. The script reads each receipt back from the chain and checks it against the expected decision. If any decision differs, it exits with an error.

1. Creates a hard-law mandate: 1 per payment, 5 per 24h, absolute ceiling 2, the counterparty allowlisted, `0x…dEaD` denylisted. Funds it with 3.
2. Agent pays 0.5: **ALLOW**.
3. Agent pays 1.5: **REFUSE**, `OVER_TX_CAP`.
4. Agent pays the denylisted address: **REFUSE**, `DENYLISTED`.
5. Owner pauses. Agent pays: **REFUSE**, `PAUSED`. Owner unpauses.
6. Agent tries to lock 1.5 in escrow: **REFUSE**, `OVER_TX_CAP`, nothing locked. Agent locks 0.5 (**ALLOW** receipt), attests delivery, and the escrow is released to the counterparty.
7. Agent pays a 0.25 HSP Cart Mandate through `payHspCart`: **ALLOW**. The run checks that the receipt carries the HSP order id. The cart is signed by the owner key acting as merchant, and no HSP merchant API call is made.
8. Set the agent sub-cap to 1.5. A 0.5 payment is **REFUSE / OVER_AGENT_CAP** after 1.25 has already been spent; remove the cap.
9. Set a 0.3 `data` envelope. A 0.4 data payment is **REFUSE / ENVELOPE_EXCEEDED**; remove the envelope.
10. Require an hourly heartbeat: a payment before check-in is **REFUSE / AGENT_HEARTBEAT_STALE**. Check in, pay 0.1 (**ALLOW**), then disable the heartbeat.
11. Sign and relay a 0.2 spend intent (**ALLOW**); a replay dry run returns `INTENT_USED`.
12. Creates a governed mandate where exceptions need 1 approval. Funds it with 2. Agent pays 1.5: **REFUSE**, `EXCEPTION_REQUIRED`. Agent requests an exception, the owner approves, and it pays out: **EXCEPTION**.
13. Owner withdraws what is left in both mandates.

The owner key needs 5 USDC.e and HSK for gas. The agent key needs HSK for gas. The optional `RELAYER_PRIVATE_KEY` defaults to the owner and needs gas. By default the counterparty is the owner, so paid amounts come back and the run costs gas. A different counterparty receives the payments. If the run stops early, unspent mandate balances may need to be withdrawn separately.

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
- Any transaction: https://hsk.blockscout.com.
- A mandate's rules and decision history: `/m/:id` in the app, subject to the app's configured deployment block and RPC log availability.
