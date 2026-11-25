/**
 * Deploy MandateFactory + Mandate to HSK Chain.
 *
 * Usage:
 *   npx tsx scripts/deploy.ts
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY - deployer private key
 *   HSK_RPC_URL          - RPC endpoint (default: https://mainnet.hsk.xyz)
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.HSK_RPC_URL || "https://mainnet.hsk.xyz";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

if (!DEPLOYER_KEY) {
  console.error("Set DEPLOYER_PRIVATE_KEY");
  process.exit(1);
}

const hskChain = {
  id: 177,
  name: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY);
  const publicClient = createPublicClient({ chain: hskChain, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: hskChain, transport: http(RPC_URL) });

  console.log(`Deployer: ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${balance} wei`);

  // Deploy using forge script instead — this file documents the process.
  // Actual deployment:
  //   cd contracts
  //   forge script script/Deploy.s.sol --rpc-url $HSK_RPC_URL --broadcast --verify
  //
  // Or use forge create directly:
  //   forge create src/MandateFactory.sol:MandateFactory \
  //     --rpc-url $HSK_RPC_URL \
  //     --private-key $DEPLOYER_PRIVATE_KEY \
  //     --verify

  console.log("\nDeploy with forge:");
  console.log("  cd contracts");
  console.log("  forge create src/MandateFactory.sol:MandateFactory \\");
  console.log("    --rpc-url $HSK_RPC_URL \\");
  console.log("    --private-key $DEPLOYER_PRIVATE_KEY");
  console.log("\nThe factory deploys the Mandate contract in its constructor.");
  console.log("Read factory.mandate() to get the Mandate address.");
}

main().catch(console.error);
