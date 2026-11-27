import { HSK_MAINNET, HSK_TESTNET } from "@lex/sdk";

const configuredChain = Number(process.env.NEXT_PUBLIC_CHAIN_ID || HSK_MAINNET.id);
if (configuredChain !== HSK_MAINNET.id && configuredChain !== HSK_TESTNET.id) {
  throw new Error("NEXT_PUBLIC_CHAIN_ID must be 177 or 133");
}
export const CHAIN_ID = configuredChain;
const NET = CHAIN_ID === HSK_TESTNET.id ? HSK_TESTNET : HSK_MAINNET;
export const RPC_URL = process.env.NEXT_PUBLIC_HSK_RPC_URL || NET.rpcUrl;
export const CONTRACTS = { mandate: (process.env.NEXT_PUBLIC_MANDATE_ADDRESS || "") as `0x${string}` };
export const TOKENS = NET.tokens;
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || NET.explorerUrl;
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || "0");
