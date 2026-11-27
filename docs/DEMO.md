# Demo

There are four ways to see Lex work: the proof run, the owner console, an agent over MCP, and the public pages. A demo video outline follows.

## 1. Proof run on a local chain

You need Foundry and Node 22. This deploys Lex to a local chain, then runs every decision type and checks each result.

```bash
anvil
```

In a second terminal:

```bash
cd contracts
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
# note the Mandate address it prints

forge create src/mocks/MockERC20.sol:MockERC20 --rpc-url http://127.0.0.1:8545 \
  --private-key $DEPLOYER_PRIVATE_KEY --broadcast --constructor-args "USD Coin" USDC 6
# note the token address

cast send <TOKEN> "mint(address,uint256)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 100000000 \
  --rpc-url http://127.0.0.1:8545 --private-key $DEPLOYER_PRIVATE_KEY

cd .. && npm install
HSK_RPC_URL=http://127.0.0.1:8545 LEX_MANDATE_ADDRESS=<MANDATE> TOKEN_ADDRESS=<TOKEN> \
AGENT_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
npx tsx scripts/exercise-mainnet.ts
```

These are Anvil's public test keys. Use them only on a local chain. Replace `<TOKEN>` and `<MANDATE>` with the deployed addresses (without angle brackets).

[MAINNET_PROOFS.md](MAINNET_PROOFS.md) lists each step. The same command with real keys and `https://mainnet.hsk.xyz` produces the mainnet proofs.

## 2. Owner console

```bash
cd sdk && npm install && npm run build
cd ../app && npm install
NEXT_PUBLIC_MANDATE_ADDRESS=0x... NEXT_PUBLIC_DEPLOY_BLOCK=<block> npm run dev
```

1. Connect a wallet on HashKey Chain.
2. **Create:** set the caps, ceiling, cooldown and minimum tier, and choose hard law or governed. For governed mandates, set the approvers and either the number of approvals or a time delay. Add the agent address, allowlist and denylist. The console shows the transaction link.
3. **Manage:** load the mandate id, then **Fund**. Funding takes two transactions, approve and fund.
4. **Agents:** bind or revoke agents, and set counterparty tiers. **Limits:** set sub-cap, envelope, heartbeat, and guardian. **Withdraw:** return unspent funds.
5. **Activity:** every decision, with links to the receipts. **Exceptions:** approve, reject, or execute after a time delay.

## 3. An agent over MCP

```bash
cd sdk && npm install && npm run build
cd ../mcp && npm install
LEX_MANDATE_ADDRESS=0x... LEX_AGENT_PRIVATE_KEY=0x... HSK_RPC_URL=https://mainnet.hsk.xyz \
npx tsx src/server.ts
```

Add it to an MCP client as a stdio server with the same command and environment. Amounts are strings in the token's smallest unit (`"2000000"` is 2 USDC). Categories are names such as `"compute"`.

Things to ask the agent to do:

- Check a payment with `can_pay` or `can_agent_spend` (including agent-specific controls)
- Send `heartbeat` when required
- Pay within the limits with `pay`. The result is ALLOW with a receipt id
- Pay over a cap with `pay`. The result is REFUSE with the reason. The tool marks it as an error so the agent doesn't assume it paid
- On a governed mandate: `request_exception`, approve it in the console, and call `execute_exception` if the mandate uses a time delay
- `pay_escrow`, then `attest_escrow` and `release_escrow`
- Pay an HSP cart with `pay_hsp_cart`. This needs `LEX_HSP_MERCHANT_SIGNERS` set to the merchant's signer address
- Review the history with `list_receipts`

For gasless signed payments, set a dedicated, funded `RELAYER_PRIVATE_KEY` in the app and `LEX_RELAYER_URL=https://<app>/api/relay` for MCP, then use `pay_via_relayer`. `GET /api/relay` reports configuration. The endpoint is unauthenticated: use an infrastructure rate limit and a small gas balance. The agent still needs gas for heartbeats when enabled.

For a single payment from the command line, `scripts/agent-pay.mjs` lists its arguments at the top of the file.

## 4. Public pages

No wallet is needed.

- `/r/:receiptId`: the decision and reason, every field, the transaction on the explorer, and the mandate it belongs to
- `/m/:mandateId`: the rules in plain terms, a payment checker that calls `canSpend`, and every decision the mandate has made

## 5. Demo video outline (about 3 minutes)

Rehearse on a local chain or testnet. A mainnet recording requires an actual verified deployment and real funds; no mainnet proof is recorded yet.

1. **Create and fund** a hard-law mandate: 1 per payment, 5 per day and ceiling 2. Show its public page. (35s)
2. **Limits:** set a 0.5 `compute` envelope and a one-hour heartbeat. (20s)
3. **Heartbeat:** pay 0.2 before check-in and show `REFUSE / AGENT_HEARTBEAT_STALE`; check in and pay again, then open its receipt. (40s)
4. **Envelope:** pay 0.4 for `compute`, exceeding the remaining 0.3, and show `REFUSE / ENVELOPE_EXCEEDED`. (20s)
5. **Sub-cap:** set the agent's sub-cap to 0.2, already spent; the next 0.1 is `REFUSE / OVER_AGENT_CAP`. Disable the sub-cap. (25s)
6. **Signed intent:** sign and submit a 0.1 intent via the relayer. Check the on-chain `ALLOW` receipt and show the agent and relayer. A replay is rejected. (25s)
7. **Public page:** show current limits, payment checker, and decision history. (20s)

A relayer preflight does not guarantee an allowed result at mining. If the state changes, show the actual receipt rather than treating transaction submission as payment.
