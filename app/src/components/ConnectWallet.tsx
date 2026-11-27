"use client";

import { injected, useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { APP_CHAIN } from "@/config/wagmi";

export function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: injected() })}
        className="px-4 py-2 border rounded hover:bg-gray-50"
      >
        Connect Wallet
      </button>
    );
  }

  const isHsk = chain?.id === APP_CHAIN.id;

  return (
    <div className="flex items-center gap-3 text-sm">
      {!isHsk && (
        <button
          onClick={() => switchChain({ chainId: APP_CHAIN.id })}
          className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
        >
          Switch to {APP_CHAIN.name}
        </button>
      )}
      <span className="text-gray-500">
        {chain?.name} · {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
      <button onClick={() => disconnect()} className="text-gray-400 hover:text-gray-600">
        Disconnect
      </button>
    </div>
  );
}
