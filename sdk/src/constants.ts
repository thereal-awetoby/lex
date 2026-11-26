import { stringToHex } from "viem";

export const HSK_MAINNET = {
  id: 177,
  name: "HashKey Chain",
  rpcUrl: "https://mainnet.hsk.xyz",
  explorerUrl: "https://hashkeyscan.io",
  tokens: {
    USDC_E: "0x054ed45810DbBAb8B27668922D110669c9D88D0a" as `0x${string}`,
    USDT: "0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029" as `0x${string}`,
  },
} as const;

export const HSK_TESTNET = {
  id: 133,
  name: "HashKey Chain Testnet",
  rpcUrl: "https://testnet.hsk.xyz",
  explorerUrl: "https://testnet.hashkeyscan.io",
  tokens: {
    USDC_E: "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6" as `0x${string}`,
    USDT: "0x372325443233fEbaC1F6998aC750276468c83CC6" as `0x${string}`,
  },
} as const;

export const REASON_CODES: Record<number, string> = {
  0: "OK",
  1: "PAUSED",
  2: "OVER_TX_CAP",
  3: "OVER_ROLLING",
  4: "NOT_ALLOWLISTED",
  5: "DENYLISTED",
  6: "TIER_TOO_LOW",
  7: "COOLDOWN",
  8: "WINDOW_CLOSED",
  9: "EXCEPTION_REQUIRED",
  10: "OVER_COUNTERPARTY_CAP",
  11: "OVER_CATEGORY_CAP",
  12: "OVER_ABSOLUTE_CEILING",
  13: "AGENT_NOT_BOUND",
  14: "INSUFFICIENT_FUNDS",
};

export const CATEGORIES = {
  COMPUTE: encodeCategory("compute"),
  DATA: encodeCategory("data"),
  FREELANCE: encodeCategory("freelance"),
  OTHER: encodeCategory("other"),
  ESCROW: encodeCategory("escrow"),
} as const;

/** Same encoding as Solidity bytes32("name"): UTF-8, right-padded to 32 bytes */
export function encodeCategory(name: string): `0x${string}` {
  return stringToHex(name, { size: 32 });
}
