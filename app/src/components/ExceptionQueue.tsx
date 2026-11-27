"use client";

import { formatUnits } from "viem";
import { CHAIN_ID } from "@/config/contracts";
import { useException, useMandateWrite } from "@/hooks/useMandate";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function ExceptionQueue({
  exceptionIds,
  canAct,
  timeDelay,
}: {
  exceptionIds: bigint[];
  canAct: boolean;
  timeDelay: bigint;
}) {
  if (exceptionIds.length === 0) {
    return <p className="text-sm text-gray-500">No exception requests.</p>;
  }
  return (
    <div className="space-y-2">
      {exceptionIds.map((id) => (
        <ExceptionRow key={id.toString()} id={id} canAct={canAct} timeDelay={timeDelay} />
      ))}
    </div>
  );
}

function ExceptionRow({ id, canAct, timeDelay }: { id: bigint; canAct: boolean; timeDelay: bigint }) {
  const { data, refetch } = useException(id);
  const { writeContract, mandateAddress, mandateAbi, isPending, isConfirming, error } = useMandateWrite();

  if (!data) return null;
  const e = data as any;
  const status = !e.resolved ? "Pending" : e.approved ? "Approved" : "Rejected";
  const delayReady =
    timeDelay > 0n && BigInt(Math.floor(Date.now() / 1000)) >= BigInt(e.createdAt) + timeDelay;
  const busy = isPending || isConfirming;

  const act = (functionName: "approveException" | "rejectException" | "executeException") => {
    writeContract(
      {
        chainId: CHAIN_ID,
        address: mandateAddress,
        abi: mandateAbi,
        functionName,
        args: functionName === "rejectException" ? [id] : [id, ZERO],
      } as any,
      { onSuccess: () => setTimeout(() => refetch(), 4000) }
    );
  };

  return (
    <div className="border rounded p-3 text-sm space-y-1">
      <div className="flex justify-between">
        <span className="font-medium">Exception #{id.toString()}</span>
        <span className="text-gray-500">{status}</span>
      </div>
      <p>
        {formatUnits(e.amount, 6)} to <span className="font-mono text-xs">{e.counterparty}</span>
      </p>
      <p className="text-gray-500">{e.reason}</p>
      <p className="text-gray-500">Approvals: {e.approvalCount.toString()}</p>
      {canAct && !e.resolved && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => act("approveException")}
            disabled={busy}
            className="px-3 py-1 bg-black text-white rounded disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => act("rejectException")}
            disabled={busy}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Reject
          </button>
          {delayReady && e.approvalCount > 0n && (
            <button
              onClick={() => act("executeException")}
              disabled={busy}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Execute
            </button>
          )}
        </div>
      )}
      {error && <p className="text-red-600 text-xs">{(error as any).shortMessage || error.message}</p>}
    </div>
  );
}
