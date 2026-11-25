"use client";

import { useParams } from "next/navigation";
import { useReceipt } from "@/hooks/useMandate";
import { REASON_CODES } from "@lex/sdk";
import { EXPLORER_URL } from "@/config/contracts";
import { formatUnits } from "viem";

const DECISION_LABELS = ["ALLOW", "REFUSE", "EXCEPTION"];
const DECISION_COLORS: Record<string, string> = {
  ALLOW: "text-green-700 bg-green-50",
  REFUSE: "text-red-700 bg-red-50",
  EXCEPTION: "text-yellow-700 bg-yellow-50",
};

export default function ReceiptPage() {
  const params = useParams();
  const receiptId = params.receiptId ? BigInt(params.receiptId as string) : undefined;
  const { data, isLoading } = useReceipt(receiptId);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading receipt...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">Receipt not found</div>;

  const r = data as any;
  const decision = DECISION_LABELS[Number(r.decision)] || "UNKNOWN";
  const reason = REASON_CODES[Number(r.reasonCode)] || `CODE_${r.reasonCode}`;

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">Lex Receipt</h1>
      <p className="text-sm text-gray-500 mb-6">On-chain spend decision record</p>

      <div
        className={`inline-block px-3 py-1 rounded text-sm font-medium mb-4 ${
          DECISION_COLORS[decision] || ""
        }`}
      >
        {decision}
      </div>

      <div className="space-y-3 text-sm">
        <Row label="Receipt ID" value={r.receiptId.toString()} />
        <Row label="Mandate ID" value={r.mandateId.toString()} />
        <Row label="Amount" value={`${formatUnits(r.amount, 6)} (6 decimals)`} />
        <Row label="Counterparty" value={r.counterparty} mono />
        <Row label="Category" value={hexToString(r.category)} />
        <Row label="Reason" value={reason} />
        <Row label="Policy Hash" value={r.policyHash} mono />
        {r.exceptionId > 0n && <Row label="Exception ID" value={r.exceptionId.toString()} />}
        {r.hspOrderId !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
          <Row label="HSP Order ID" value={r.hspOrderId} mono />
        )}
        <Row
          label="Timestamp"
          value={new Date(Number(r.timestamp) * 1000).toISOString()}
        />
        <Row label="Token" value={r.token} mono />
      </div>

      <div className="mt-6 pt-4 border-t text-xs text-gray-400">
        Verify on-chain at{" "}
        <a href={EXPLORER_URL} target="_blank" rel="noopener" className="underline">
          HashKey Scan
        </a>
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-gray-500">{label}</span>
      <p className={`break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function hexToString(hex: string): string {
  try {
    const clean = hex.replace(/0+$/, "");
    if (clean.length <= 2) return hex;
    const bytes = [];
    for (let i = 2; i < clean.length; i += 2) {
      bytes.push(parseInt(clean.substring(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return hex;
  }
}
