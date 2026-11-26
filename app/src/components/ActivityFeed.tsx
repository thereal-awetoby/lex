"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { REASON_CODES } from "@lex/sdk";
import { EXPLORER_URL } from "@/config/contracts";
import type { DecisionLog } from "@/hooks/useMandateLogs";

const LABELS = ["ALLOW", "REFUSE", "EXCEPTION"];
const COLORS = ["text-green-700", "text-red-700", "text-yellow-700"];

export function ActivityFeed({
  decisions,
  loading,
  error,
}: {
  decisions: DecisionLog[];
  loading: boolean;
  error?: string;
}) {
  if (loading) return <p className="text-sm text-gray-500">Loading activity...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (decisions.length === 0) return <p className="text-sm text-gray-500">No spend decisions yet.</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b">
          <th className="py-2">Receipt</th>
          <th>Decision</th>
          <th>Amount</th>
          <th>Counterparty</th>
          <th>Tx</th>
        </tr>
      </thead>
      <tbody>
        {decisions.map((d) => (
          <tr key={d.receiptId.toString()} className="border-b">
            <td className="py-2">
              <Link href={`/r/${d.receiptId}`} className="underline">
                #{d.receiptId.toString()}
              </Link>
            </td>
            <td className={COLORS[d.decision] || ""}>
              {LABELS[d.decision] || "?"}
              {d.decision === 1 && (
                <span className="block text-xs text-gray-500">
                  {REASON_CODES[d.reasonCode] || d.reasonCode}
                </span>
              )}
            </td>
            <td>{formatUnits(d.amount, 6)}</td>
            <td className="font-mono text-xs">
              {d.counterparty.slice(0, 6)}…{d.counterparty.slice(-4)}
            </td>
            <td>
              <a href={`${EXPLORER_URL}/tx/${d.txHash}`} target="_blank" rel="noopener" className="underline">
                view
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
