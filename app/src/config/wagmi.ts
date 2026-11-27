import { http, createConfig } from "wagmi";
import { type Chain } from "viem";
import { CHAIN_ID, RPC_URL } from "./contracts";

export const hskMainnet: Chain = {
  id: 177,
  name: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://hsk.blockscout.com" },
  },
};

export const hskTestnet: Chain = {
  id: 133,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://testnet-explorer.hskchain.net" },
  },
};

export const APP_CHAIN: Chain = CHAIN_ID === hskTestnet.id ? hskTestnet : hskMainnet;
const OTHER_CHAIN: Chain = APP_CHAIN.id === hskMainnet.id ? hskTestnet : hskMainnet;

export const config = createConfig({
  chains: [APP_CHAIN, OTHER_CHAIN],
  transports: {
    [hskMainnet.id]: http(CHAIN_ID === hskMainnet.id ? RPC_URL : undefined),
    [hskTestnet.id]: http(CHAIN_ID === hskTestnet.id ? RPC_URL : undefined),
  },
});
