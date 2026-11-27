"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MANDATE_ABI } from "@lex/sdk";
import { CHAIN_ID, CONTRACTS } from "@/config/contracts";

export function useMandateRead(mandateId: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.mandate,
    abi: MANDATE_ABI,
    chainId: CHAIN_ID,
    functionName: "getMandate",
    args: mandateId !== undefined ? [mandateId] : undefined,
    query: { enabled: mandateId !== undefined },
  });
}

export function useCanSpend(
  mandateId: bigint | undefined,
  amount: bigint | undefined,
  counterparty: `0x${string}` | undefined,
  category: `0x${string}` | undefined
) {
  return useReadContract({
    address: CONTRACTS.mandate,
    abi: MANDATE_ABI,
    chainId: CHAIN_ID,
    functionName: "canSpend",
    args:
      mandateId !== undefined && amount !== undefined && counterparty && category
        ? [mandateId, amount, counterparty, category]
        : undefined,
    query: {
      enabled: mandateId !== undefined && amount !== undefined && !!counterparty && !!category,
    },
  });
}

export function useReceipt(receiptId: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.mandate,
    abi: MANDATE_ABI,
    chainId: CHAIN_ID,
    functionName: "getReceipt",
    args: receiptId !== undefined ? [receiptId] : undefined,
    query: { enabled: receiptId !== undefined },
  });
}

export function useException(exceptionId: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.mandate,
    abi: MANDATE_ABI,
    chainId: CHAIN_ID,
    functionName: "getException",
    args: exceptionId !== undefined ? [exceptionId] : undefined,
    query: { enabled: exceptionId !== undefined },
  });
}

export function useMandateWrite() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: CHAIN_ID });

  return {
    writeContract,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    mandateAddress: CONTRACTS.mandate,
    mandateAbi: MANDATE_ABI,
  };
}
