"use client";

import { useEffect, useState, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { CHAIN_ID, CONTRACTS, DEPLOY_BLOCK } from "@/config/contracts";

const SPEND_DECISION = parseAbiItem(
  "event SpendDecision(uint256 indexed mandateId, uint256 indexed receiptId, uint8 decision, uint16 reasonCode, uint256 amount, address counterparty, bytes32 category)"
);
const EXCEPTION_REQUESTED = parseAbiItem(
  "event ExceptionRequested(uint256 indexed mandateId, uint256 indexed exceptionId, uint256 amount, address counterparty)"
);

export interface DecisionLog {
  receiptId: bigint;
  decision: number;
  reasonCode: number;
  amount: bigint;
  counterparty: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

export function useMandateLogs(mandateId: bigint | undefined) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [decisions, setDecisions] = useState<DecisionLog[]>([]);
  const [exceptionIds, setExceptionIds] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!client || mandateId === undefined || !CONTRACTS.mandate) return;
    setLoading(true);
    setError(undefined);
    try {
      const [spendLogs, excLogs] = await Promise.all([
        client.getLogs({
          address: CONTRACTS.mandate,
          event: SPEND_DECISION,
          args: { mandateId },
          fromBlock: DEPLOY_BLOCK,
        }),
        client.getLogs({
          address: CONTRACTS.mandate,
          event: EXCEPTION_REQUESTED,
          args: { mandateId },
          fromBlock: DEPLOY_BLOCK,
        }),
      ]);
      setDecisions(
        spendLogs
          .map((l) => ({
            receiptId: l.args.receiptId!,
            decision: Number(l.args.decision),
            reasonCode: Number(l.args.reasonCode),
            amount: l.args.amount!,
            counterparty: l.args.counterparty!,
            txHash: l.transactionHash!,
            blockNumber: l.blockNumber!,
          }))
          .reverse()
      );
      setExceptionIds(excLogs.map((l) => l.args.exceptionId!).reverse());
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [client, mandateId]);

  useEffect(() => {
    load();
  }, [load]);

  return { decisions, exceptionIds, loading, error, reload: load };
}
