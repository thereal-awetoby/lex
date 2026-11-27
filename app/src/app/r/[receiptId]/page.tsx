"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePublicClient } from "wagmi";
import { formatUnits, hexToString, parseAbiItem } from "viem";
import { REASON_CODES } from "@lex/sdk";
import { useReceipt } from "@/hooks/useMandate";
import { CONTRACTS, DEPLOY_BLOCK, EXPLORER_URL } from "@/config/contracts";

const DECISION_LABELS = ["ALLOW", "REFUSE", "EXCEPTION"];
const DECISION_COLORS: Record<string, string> = {
  ALLOW: "text-green-700 bg-green-50",
  REFUSE: "text-red-700 bg-red-50",
  EXCEPTION: "text-yellow-700 bg-yellow-50",
};
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const SPEND_DECISION = parseAbiItem(
  "event SpendDecision(uint256 indexed mandateId, uint256 indexed receiptId, uint8 decision, uint16 reasonCode, uint256 amount, address counterparty, bytes32 category)"
);

export default function ReceiptPage() {
  const params = useParams();
  const raw = params.receiptId as string | undefined;
  const receiptId = raw && /^\d+$/.test(raw) ? BigInt(raw) : undefined;
  const { data, isLoading } = useReceipt(receiptId);
  const client = usePublicClient();
  const [txHash, setTxHash] = useState<`0x${string}`>();

  // The receipt struct has no tx hash; find the transaction from the indexed event
  useEffect(() => {
    if (!client || receiptId === undefined || !CONTRACTS.mandate) return;
    client
      .getLogs({
        address: CONTRACTS.mandate,
        event: SPEND_DECISION,
        args: { receiptId },
        fromBlock: DEPLOY_BLOCK,
      })
      .then((logs) => setTxHash(logs[0]?.transactionHash ?? undefined))
      .catch(() => {});
  }, [client, receiptId]);

  if (receiptId === undefined) return <Message text="Invalid receipt id" />;
  if (isLoading) return <Message text="Loading receipt..." />;

  const r = data as any;
  if (!r || r.receiptId === 0n) return <Message text={`Receipt #${raw} not found`} />;

  const decision = DECISION_LABELS[Number(r.decision)] || "UNKNOWN";
  const reason = REASON_CODES[Number(r.reasonCode)] || `CODE_${r.reasonCode}`;
  const isEscrow = r.txRef !== ZERO32;

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">Lex receipt #{r.receiptId.toString()}</h1>
      <p className="text-sm text-gray-500 mb-6">On-chain record of a spend decision</p>

      <div className={`inline-block px-3 py-1 rounded text-sm font-medium mb-4 ${DECISION_COLORS[decision] || ""}`}>
        {decision}
        {decision === "REFUSE" && <span className="font-normal"> · {reason}</span>}
      </div>

      <div className="space-y-3 text-sm">
        <Row label="Mandate">
          <Link href={`/m/${r.mandateId}`} className="underline">
            #{r.mandateId.toString()}
          </Link>
        </Row>
        <Row label="Amount" value={`${formatUnits(r.amount, 6)}`} />
        <Row label="Counterparty" value={r.counterparty} mono />
        <Row label="Category" value={categoryLabel(r.category)} />
        {r.ref !== ZERO32 && <Row label="Reference" value={r.ref} mono />}
        {r.exceptionId > 0n && <Row label="Exception" value={`#${r.exceptionId.toString()}`} />}
        {r.hspOrderId !== ZERO32 && <Row label="HSP order id (keccak256 of payment request id)" value={r.hspOrderId} mono />}
        {isEscrow && <Row label="Escrow" value={`#${BigInt(r.txRef).toString()}`} />}
        <Row label="Policy hash (rules in force)" value={r.policyHash} mono />
        <Row label="Agent" value={r.agent} mono />
        <Row label="Token" value={r.token} mono />
        <Row label="Time" value={new Date(Number(r.timestamp) * 1000).toISOString()} />
        <Row label="Transaction">
          {txHash ? (
            <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noopener" className="underline font-mono text-xs break-all">
              {txHash}
            </a>
          ) : (
            <span className="text-gray-400">looking up...</span>
          )}
        </Row>
      </div>

      <p className="mt-6 pt-4 border-t text-xs text-gray-400">
        Read directly from the Mandate contract{" "}
        <a href={`${EXPLORER_URL}/address/${CONTRACTS.mandate}`} target="_blank" rel="noopener" className="underline font-mono">
          {CONTRACTS.mandate}
        </a>{" "}
        via <code>getReceipt({r.receiptId.toString()})</code>.
      </p>
    </main>
  );
}

function Message({ text }: { text: string }) {
  return <div className="p-8 text-center text-gray-500">{text}</div>;
}

function Row({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-gray-500">{label}</span>
      {children ? <div>{children}</div> : <p className={`break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</p>}
    </div>
  );
}

function categoryLabel(hex: `0x${string}`): string {
  try {
    const s = hexToString(hex, { size: 32 }).replace(/\0+$/, "");
    return s && /^[\x20-\x7e]+$/.test(s) ? s : hex;
  } catch {
    return hex;
  }
}
