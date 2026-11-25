# Demo Walkthrough

## Setup

```bash
# Install dependencies
cd contracts && forge install
cd ../sdk && npm install
cd ../mcp && npm install
cd ../app && npm install

# Copy env
cp .env.example .env
# Fill in: DEPLOYER_PRIVATE_KEY, AGENT_PRIVATE_KEY, HSK_RPC_URL, TOKEN_ADDRESS
```

## 1. Deploy

```bash
cd contracts
forge create src/MandateFactory.sol:MandateFactory \
  --rpc-url $HSK_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Note the factory address. Read `mandate()` from it to get the Mandate contract address.

## 2. Create a Mandate

Using the owner console (`app/`):

1. Connect wallet
2. Set rules:
   - Per-tx cap: 100 USDC.e
   - Rolling cap: 500 USDC.e / 24h
   - Per-counterparty cap: 200 USDC.e
   - Cooldown: 60 seconds
   - Exception mode: Hard Law
3. Select token: USDC.e
4. Add agent address
5. Submit — mandate ID returned

## 3. Fund the Mandate

In the mandate view:
1. Enter amount (e.g., 1000 USDC.e)
2. Click Fund — auto-approves token then transfers

## 4. Agent Spends

Headless agent script:

```bash
export LEX_MANDATE_ADDRESS=0x...
export LEX_AGENT_PRIVATE_KEY=0x...

node scripts/agent-pay.mjs \
  --mandate 1 \
  --to 0xCounterparty \
  --amount 50 \
  --memo "API subscription payment"
```

Output:
```
Pre-flight passed. Sending spend tx...
Tx hash: 0x...
Block: 12345, status: success
Receipt ID: 1
Decision: ALLOW
```

## 5. Verify Receipt

Public page — no auth required:

```
https://your-app.vercel.app/r/1
```

Shows: decision (ALLOW), amount, counterparty, timestamp, mandate rules, tx link on HashKeyScan.

## 6. MCP Server (AI Agent Integration)

```bash
export LEX_MANDATE_ADDRESS=0x...
export LEX_AGENT_PRIVATE_KEY=0x...

npx tsx mcp/src/server.ts
```

The MCP server exposes tools an AI agent can call:

- `can_pay` — pre-flight check before spending
- `pay` — execute a spend through the mandate
- `get_receipt` — verify a past decision
- `list_receipts` — audit trail for a mandate
- `get_mandate` — read current rules and balances
- `request_exception` — request exception (governed mandates)
- `get_exception` — check exception status
- `get_escrow` — check escrow status

## 7. Test a Refusal

Try spending over the per-tx cap:

```bash
node scripts/agent-pay.mjs \
  --mandate 1 \
  --to 0xCounterparty \
  --amount 200
```

Output:
```
canSpend returned REFUSE — reason code: 2
```

Reason code 2 = OVER_TX_CAP. The receipt is still created on-chain documenting the refusal.

## 8. Escrow Flow

For counterparty-attested payments:

1. Agent calls `payWithEscrow` — funds locked
2. Counterparty calls `attestEscrow` — confirms delivery
3. Owner calls `releaseEscrow` — funds transferred
4. If timeout expires: `refundEscrow` returns funds to mandate

## 9. Exception Flow (Governed Mandates)

1. Create mandate with `exceptionMode: GOVERNED`, `exceptionApprovalThreshold: 2`
2. Agent's spend gets REFUSE (e.g., over cap)
3. Agent calls `requestException` — exception ID returned
4. Approver 1 calls `approveException`
5. Approver 2 calls `approveException` — threshold met, spend executes
6. Receipt shows `Decision.EXCEPTION`

## Mainnet Exercise

Run the full flow on HSK mainnet:

```bash
npx tsx scripts/exercise-mainnet.ts
```

Produces `docs/mainnet-proofs.json` with tx hashes and explorer links for every step.
