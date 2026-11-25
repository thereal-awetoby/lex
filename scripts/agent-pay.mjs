#!/usr/bin/env node
/**
 * Headless agent spend script.
 * An AI agent runs this to propose + execute a spend through its mandate.
 *
 * Usage:
 *   node scripts/agent-pay.mjs \
 *     --mandate 1 \
 *     --to 0xCounterparty \
 *     --amount 50 \
 *     --category 0x0000...0001 \
 *     --memo "API subscription"
 *
 * Env:
 *   LEX_MANDATE_ADDRESS  - deployed Mandate contract
 *   HSK_RPC_URL          - RPC (default: https://mainnet.hsk.xyz)
 *   LEX_AGENT_PRIVATE_KEY - agent's private key
 *
 * NOTE: the on-chain `spend` signature is
 *   spend(uint256 mandateId, uint256 amount, address counterparty, bytes32 category, bytes32 ref, bytes32 hspOrderId)
 * and `canSpend` is
 *   canSpend(uint256 mandateId, uint256 amount, address counterparty, bytes32 category)
 * Keep the ABI + argument order in sync with contracts/src/Mandate.sol.
 */

import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    mandate: { type: "string" },
    to: { type: "string" },
    amount: { type: "string" },
    category: { type: "string", default: "0x" + "00".repeat(32) },
    memo: { type: "string", default: "" },
  },
});

const RPC = process.env.HSK_RPC_URL || "https://mainnet.hsk.xyz";
const MANDATE_ADDR = process.env.LEX_MANDATE_ADDRESS;
const AGENT_KEY = process.env.LEX_AGENT_PRIVATE_KEY;

if (!MANDATE_ADDR || !AGENT_KEY || !args.mandate || !args.to || !args.amount) {
  console.error("Missing required env/args. See header for usage.");
  process.exit(1);
}

const chain = {
  id: 177,
  name: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

// Argument order MUST match contracts/src/Mandate.sol.
const abi = parseAbi([
  "function canSpend(uint256 mandateId, uint256 amount, address counterparty, bytes32 category) view returns (bool allowed, uint16 reasonCode)",
  "function spend(uint256 mandateId, uint256 amount, address counterparty, bytes32 category, bytes32 ref, bytes32 hspOrderId) returns (uint256 receiptId)",
  "event SpendDecision(uint256 indexed mandateId, uint256 indexed receiptId, uint8 decision, uint16 reasonCode, uint256 amount, address counterparty, bytes32 category)",
]);

async function main() {
  const account = privateKeyToAccount(AGENT_KEY);
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain, transport: http(RPC) });

  const mandateId = BigInt(args.mandate);
  const counterparty = args.to;
  const amount = parseUnits(args.amount, 6); // USDC.e / USDT = 6 decimals
  const category = args.category;
  // spend takes a bytes32 ref (invoice/order id), not a string memo.
  const ref = "0x" + "00".repeat(32);
  const hspOrderId = "0x" + "00".repeat(32);

  // Pre-flight check
  const [allowed, reasonCode] = await publicClient.readContract({
    address: MANDATE_ADDR,
    abi,
    functionName: "canSpend",
    args: [mandateId, amount, counterparty, category],
  });

  if (!allowed) {
    console.error(`canSpend returned REFUSE — reason code: ${reasonCode}`);
    process.exit(2);
  }

  console.log("Pre-flight passed. Sending spend tx...");

  const hash = await walletClient.writeContract({
    address: MANDATE_ADDR,
    abi,
    functionName: "spend",
    args: [mandateId, amount, counterparty, category, ref, hspOrderId],
  });

  console.log(`Tx hash: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Block: ${receipt.blockNumber}, status: ${receipt.status}`);

  // Parse receipt ID from event
  for (const log of receipt.logs) {
    try {
      const decoded = publicClient.decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName === "SpendDecision") {
        console.log(`Receipt ID: ${decoded.args.receiptId}`);
        console.log(`Decision: ${decoded.args.decision === 0 ? "ALLOW" : "REFUSE"}`);
      }
    } catch {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
