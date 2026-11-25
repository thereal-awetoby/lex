import { http, createConfig } from "wagmi";
import { type Chain } from "viem";

export const hskMainnet: Chain = {
  id: 177,
  name: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "HashKey Scan", url: "https://hashkeyscan.io" },
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
    default: { name: "HashKey Scan", url: "https://testnet.hashkeyscan.io" },
  },
};

export const config = createConfig({
  chains: [hskMainnet, hskTestnet],
  transports: {
    [hskMainnet.id]: http(),
    [hskTestnet.id]: http(),
  },
});
