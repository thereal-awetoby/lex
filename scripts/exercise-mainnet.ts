/**
 * Exercise script — creates a mandate, funds it, runs a spend, and verifies the receipt.
 * Produces mainnet proof artifacts for the hackathon submission.
 *
 * Usage:
 *   npx tsx scripts/exercise-mainnet.ts
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY  - owner key (creates mandate, funds it)
 *   AGENT_PRIVATE_KEY     - agent key (executes spend)
 *   LEX_MANDATE_ADDRESS   - deployed Mandate contract
 *   HSK_RPC_URL           - RPC (default: https://mainnet.hsk.xyz)
 *   TOKEN_ADDRESS         - USDC.e or USDT address
 *
 * IMPORTANT: the contract's `Rules` struct order (see contracts/src/interfaces/IMandate.sol)
 * and the `canSpend` / `spend` argument order MUST be kept in sync here:
 *   createMandate(Rules rules, address token, address[] agents, address[] allowlist, address[] denylist, address[] approvers)
 *   canSpend(uint256 mandateId, uint256 amount, address counterparty, bytes32 category)
 *   spend(uint256 mandateId, uint256 amount, address counterparty, bytes32 category, bytes32 ref, bytes32 hspOrderId)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "node:fs";

const RPC = process.env.HSK_RPC_URL || "https://mainnet.hsk.xyz";
const MANDATE_ADDR = getAddress(process.env.LEX_MANDATE_ADDRESS!);
const OWNER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const TOKEN = getAddress(process.env.TOKEN_ADDRESS || "0x054ed45810DbBAb8B27668922D110669c9D88D0a"); // USDC.e

if (!OWNER_KEY || !AGENT_KEY || !MANDATE_ADDR) {
  console.error("Set DEPLOYER_PRIVATE_KEY, AGENT_PRIVATE_KEY, LEX_MANDATE_ADDRESS");
  process.exit(1);
}

const chain = {
  id: 177,
  name: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

// These MUST match contracts/src/Mandate.sol (IMandate.Rules struct order).
const MANDATE_ABI = [
  {
    type: "function",
    name: "createMandate",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "rules",
        type: "tuple",
        components: [
          { name: "perTxCap", type: "uint256" },
          { name: "rollingWindowCap", type: "uint256" },
          { name: "rollingWindowDuration", type: "uint256" },
          { name: "perCounterpartyCap", type: "uint256" },
          { name: "perCategoryCap", type: "uint256" },
          { name: "cooldownSeconds", type: "uint256" },
          { name: "activeWindowStart", type: "uint256" },
          { name: "activeWindowEnd", type: "uint256" },
          { name: "minCounterpartyTier", type: "uint256" },
          { name: "absoluteCeiling", type: "uint256" },
          { name: "exceptionMode", type: "uint8" },
          { name: "preferredRail", type: "uint8" },
          { name: "exceptionApprovalThreshold", type: "uint8" },
          { name: "exceptionTimeDelay", type: "uint256" },
          { name: "timelockForRuleChange", type: "uint256" },
        ],
      },
      { name: "token", type: "address" },
      { name: "initialAgents", type: "address[]" },
      { name: "initialAllowlist", type: "address[]" },
      { name: "initialDenylist", type: "address[]" },
      { name: "initialApprovers", type: "address[]" },
    ],
    outputs: [{ name: "mandateId", type: "uint256" }],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "spend",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "category", type: "bytes32" },
      { name: "ref", type: "bytes32" },
      { name: "hspOrderId", type: "bytes32" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getMandate",
    stateMutability: "view",
    inputs: [{ name: "mandateId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "paused", type: "bool" },
      { name: "token", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "policyHash", type: "bytes32" },
      {
        name: "rules",
        type: "tuple",
        components: [
          { name: "perTxCap", type: "uint256" },
          { name: "rollingWindowCap", type: "uint256" },
          { name: "rollingWindowDuration", type: "uint256" },
          { name: "perCounterpartyCap", type: "uint256" },
          { name: "perCategoryCap", type: "uint256" },
          { name: "cooldownSeconds", type: "uint256" },
          { name: "activeWindowStart", type: "uint256" },
          { name: "activeWindowEnd", type: "uint256" },
          { name: "minCounterpartyTier", type: "uint256" },
          { name: "absoluteCeiling", type: "uint256" },
          { name: "exceptionMode", type: "uint8" },
          { name: "preferredRail", type: "uint8" },
          { name: "exceptionApprovalThreshold", type: "uint8" },
          { name: "exceptionTimeDelay", type: "uint256" },
          { name: "timelockForRuleChange", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getReceipt",
    stateMutability: "view",
    inputs: [{ name: "receiptId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "receiptId", type: "uint256" },
          { name: "mandateId", type: "uint256" },
          { name: "policyHash", type: "bytes32" },
          { name: "decision", type: "uint8" },
          { name: "reasonCode", type: "uint16" },
          { name: "amount", type: "uint256" },
          { name: "token", type: "address" },
          { name: "counterparty", type: "address" },
          { name: "category", type: "bytes32" },
          { name: "ref", type: "bytes32" },
          { name: "exceptionId", type: "uint256" },
          { name: "hspOrderId", type: "bytes32" },
          { name: "txRef", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "canSpend",
    stateMutability: "view",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "category", type: "bytes32" },
    ],
    outputs: [
      { name: "", type: "bool" },
      { name: "", type: "uint16" },
    ],
  },
  {
    type: "event",
    name: "MandateCreated",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SpendDecision",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "receiptId", type: "uint256", indexed: true },
      { name: "decision", type: "uint8", indexed: false },
      { name: "reasonCode", type: "uint16", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "counterparty", type: "address", indexed: false },
      { name: "category", type: "bytes32", indexed: false },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const EXPLORER = "https://hashkeyscan.io";

interface Proof {
  step: string;
  txHash?: string;
  blockNumber?: bigint;
  explorerUrl?: string;
  details: Record<string, unknown>;
}

async function main() {
  const owner = privateKeyToAccount(OWNER_KEY);
  const agent = privateKeyToAccount(AGENT_KEY);

  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const agentWallet = createWalletClient({ account: agent, chain, transport: http(RPC) });

  const proofs: Proof[] = [];
  const log = (step: string, data: Partial<Proof>) => {
    const p: Proof = { step, details: {}, ...data };
    if (p.txHash) p.explorerUrl = `${EXPLORER}/tx/${p.txHash}`;
    proofs.push(p);
    console.log(`\n=== ${step} ===`);
    console.log(JSON.stringify(p, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  };

  // 1. Check token balance
  const tokenBal = await publicClient.readContract({
    address: TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner.address],
  });
  log("Token Balance", { details: { owner: owner.address, balance: formatUnits(tokenBal, 6), token: TOKEN } });

  const fundAmount = parseUnits("10", 6); // 10 USDC.e
  const spendAmount = parseUnits("2", 6); // 2 USDC.e

  // 2. Create mandate — Rules struct order MUST match the contract.
  const rules = {
    perTxCap: parseUnits("5", 6),
    rollingWindowCap: parseUnits("50", 6),
    rollingWindowDuration: 86400n,
    perCounterpartyCap: parseUnits("20", 6),
    perCategoryCap: parseUnits("30", 6),
    cooldownSeconds: 60n,
    activeWindowStart: 0n,
    activeWindowEnd: 0n,
    minCounterpartyTier: 0n,
    absoluteCeiling: parseUnits("100", 6),
    exceptionMode: 0, // HARD_LAW (uint8)
    preferredRail: 0, // HSP (uint8)
    exceptionApprovalThreshold: 0,
    exceptionTimeDelay: 0n,
    timelockForRuleChange: 0n,
  };

  console.log("\nCreating mandate...");
  const createHash = await ownerWallet.writeContract({
    address: MANDATE_ADDR,
    abi: MANDATE_ABI,
    functionName: "createMandate",
    args: [rules, TOKEN, [agent.address], [], [], []],
  });
  const createRx = await publicClient.waitForTransactionReceipt({ hash: createHash });
  log("Create Mandate", {
    txHash: createHash,
    blockNumber: createRx.blockNumber,
    details: { agent: agent.address, rules: { perTxCap: "5", rollingCap: "50", absoluteCeiling: "100" } },
  });

  // Parse mandate ID from logs (MandateCreated: topics[1] = mandateId)
  let mandateId = 0n;
  for (const l of createRx.logs) {
    try {
      if (l.topics[0] && l.topics[1]) {
        mandateId = BigInt(l.topics[1]);
        break;
      }
    } catch {}
  }
  console.log(`Mandate ID: ${mandateId}`);

  // 3. Approve + fund
  console.log("\nApproving token...");
  const approveHash = await ownerWallet.writeContract({
    address: TOKEN,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [MANDATE_ADDR, fundAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  console.log("Funding mandate...");
  const fundHash = await ownerWallet.writeContract({
    address: MANDATE_ADDR,
    abi: MANDATE_ABI,
    functionName: "fund",
    args: [mandateId, fundAmount],
  });
  const fundRx = await publicClient.waitForTransactionReceipt({ hash: fundHash });
  log("Fund Mandate", {
    txHash: fundHash,
    blockNumber: fundRx.blockNumber,
    details: { mandateId: mandateId.toString(), amount: "10 USDC.e" },
  });

  // 4. canSpend pre-flight — arg order: (mandateId, amount, counterparty, category)
  const counterparty = "0x000000000000000000000000000000000000dEaD";
  const category = ("0x" + "00".repeat(32)) as `0x${string}`;
  const [allowed, reason] = await publicClient.readContract({
    address: MANDATE_ADDR,
    abi: MANDATE_ABI,
    functionName: "canSpend",
    args: [mandateId, spendAmount, counterparty, category],
  });
  log("canSpend Pre-flight", {
    details: { allowed, reasonCode: reason, amount: "2 USDC.e", counterparty },
  });

  // 5. Agent spends — arg order: (mandateId, amount, counterparty, category, ref, hspOrderId)
  console.log("\nAgent executing spend...");
  const ref = ("0x" + "00".repeat(32)) as `0x${string}`;
  const hspOrderId = ("0x" + "00".repeat(32)) as `0x${string}`;
  const spendHash = await agentWallet.writeContract({
    address: MANDATE_ADDR,
    abi: MANDATE_ABI,
    functionName: "spend",
    args: [mandateId, spendAmount, counterparty, category, ref, hspOrderId],
  });
  const spendRx = await publicClient.waitForTransactionReceipt({ hash: spendHash });

  let receiptId = 0n;
  for (const l of spendRx.logs) {
    try {
      if (l.topics[0] && l.topics[2]) {
        receiptId = BigInt(l.topics[2]);
      }
    } catch {}
  }
  log("Agent Spend", {
    txHash: spendHash,
    blockNumber: spendRx.blockNumber,
    details: { mandateId: mandateId.toString(), receiptId: receiptId.toString(), amount: "2 USDC.e" },
  });

  // 6. Verify receipt
  console.log("\nReading receipt on-chain...");
  const receipt = await publicClient.readContract({
    address: MANDATE_ADDR,
    abi: MANDATE_ABI,
    functionName: "getReceipt",
    args: [receiptId],
  });
  log("Verify Receipt", {
    details: { receiptId: receiptId.toString(), receipt: JSON.parse(JSON.stringify(receipt, (_, v) => (typeof v === "bigint" ? v.toString() : v))) },
  });

  // Write proof file
  const proofJson = JSON.stringify(proofs, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  writeFileSync("docs/mainnet-proofs.json", proofJson);
  console.log("\n\nProofs written to docs/mainnet-proofs.json");
  console.log("Explorer links:");
  proofs.filter((p) => p.explorerUrl).forEach((p) => console.log(`  ${p.step}: ${p.explorerUrl}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
