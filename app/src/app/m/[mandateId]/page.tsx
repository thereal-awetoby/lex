"use client";

import { useParams } from "next/navigation";
import { useMandateRead } from "@/hooks/useMandate";
import { formatUnits } from "viem";

export default function MandatePublicPage() {
  const params = useParams();
  const mandateId = params.mandateId ? BigInt(params.mandateId as string) : undefined;
  const { data, isLoading } = useMandateRead(mandateId);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading mandate...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">Mandate not found</div>;

  const [owner, paused, token, balance, policyHash, rules] = data as any;

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">Lex Mandate #{mandateId?.toString()}</h1>
      <p className="text-sm text-gray-500 mb-6">Public spending policy summary</p>

      {paused && (
        <div className="px-3 py-1 bg-red-50 text-red-700 text-sm rounded mb-4 inline-block">
          PAUSED
        </div>
      )}

      <div className="space-y-3 text-sm">
        <Row label="Owner" value={owner} mono />
        <Row label="Balance" value={`${formatUnits(balance, 6)} (6 decimals)`} />
        <Row label="Per-tx cap" value={formatUnits(rules.perTxCap, 6)} />
        <Row label="Rolling 24h cap" value={formatUnits(rules.rollingWindowCap, 6)} />
        <Row label="Per-counterparty cap" value={formatUnits(rules.perCounterpartyCap, 6)} />
        <Row label="Per-category cap" value={formatUnits(rules.perCategoryCap, 6)} />
        <Row label="Cooldown" value={`${rules.cooldownSeconds.toString()}s`} />
        <Row
          label="Exception mode"
          value={Number(rules.exceptionMode) === 0 ? "Hard law" : "Governed"}
        />
        <Row label="Policy hash" value={policyHash} mono />
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
