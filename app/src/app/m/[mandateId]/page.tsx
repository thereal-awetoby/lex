"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { formatUnits, isAddress, parseUnits } from "viem";
import { REASON_CODES, encodeCategory } from "@lex/sdk";
import { useCanSpend, useMandateRead } from "@/hooks/useMandate";
import { useMandateLogs } from "@/hooks/useMandateLogs";
import { ActivityFeed } from "@/components/ActivityFeed";
import { EXPLORER_URL } from "@/config/contracts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RAILS = ["HSP", "Direct", "HSP then direct"];

export default function MandatePublicPage() {
  const params = useParams();
  const raw = params.mandateId as string | undefined;
  const mandateId = raw && /^\d+$/.test(raw) ? BigInt(raw) : undefined;
  const { data, isLoading } = useMandateRead(mandateId);
  const logs = useMandateLogs(mandateId);

  if (mandateId === undefined) return <Message text="Invalid mandate id" />;
  if (isLoading) return <Message text="Loading mandate..." />;
  if (!data || (data as any)[0] === ZERO_ADDRESS) return <Message text={`Mandate #${raw} not found`} />;

  const [owner, paused, token, balance, policyHash, rules] = data as any;
  const fmt = (v: bigint) => (v === 0n ? "none" : formatUnits(v, 6));

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">Lex mandate #{mandateId.toString()}</h1>
        <p className="text-sm text-gray-500">Spending rules an agent cannot step outside of</p>
        {paused && (
          <div className="mt-3 px-3 py-1 bg-red-50 text-red-700 text-sm rounded inline-block">PAUSED</div>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 text-sm">
        <Row label="Owner" value={owner} mono />
        <Row label="Balance" value={formatUnits(balance, 6)} />
        <Row label="Per-payment cap" value={fmt(rules.perTxCap)} />
        <Row label="Rolling window cap" value={`${fmt(rules.rollingWindowCap)} / ${Number(rules.rollingWindowDuration || 86400n) / 3600}h`} />
        <Row label="Per-counterparty cap" value={fmt(rules.perCounterpartyCap)} />
        <Row label="Per-category cap" value={fmt(rules.perCategoryCap)} />
        <Row label="Absolute ceiling" value={fmt(rules.absoluteCeiling)} />
        <Row label="Cooldown" value={`${rules.cooldownSeconds.toString()}s`} />
        <Row
          label="Exceptions"
          value={
            Number(rules.exceptionMode) === 0
              ? "Hard law: none possible"
              : `Governed: ${
                  rules.exceptionApprovalThreshold > 0
                    ? `${rules.exceptionApprovalThreshold} approval(s)`
                    : rules.exceptionTimeDelay > 0n
                    ? `1 approval + ${rules.exceptionTimeDelay.toString()}s delay`
                    : "owner approval"
                }`
          }
        />
        <Row
          label="Rule change timelock"
          value={rules.timelockForRuleChange > 0n ? `${rules.timelockForRuleChange.toString()}s` : "none"}
        />
        <Row label="Preferred rail" value={RAILS[Number(rules.preferredRail)] || "?"} />
        <Row label="Token" value={token} mono />
        <div className="col-span-2">
          <Row label="Policy hash" value={policyHash} mono />
        </div>
      </section>

      <PaymentCheck mandateId={mandateId} />

      <section>
        <h2 className="font-medium mb-2">Decisions</h2>
        <ActivityFeed decisions={logs.decisions} loading={logs.loading} error={logs.error} />
      </section>

      <p className="text-xs text-gray-400">
        All values are read from the chain.{" "}
        <a href={`${EXPLORER_URL}/address/${owner}`} target="_blank" rel="noopener" className="underline">
          Owner on HashKey Scan
        </a>
      </p>
    </main>
  );
}

/** Runs the contract's canSpend view so anyone can see what the agent would be allowed to do */
function PaymentCheck({ mandateId }: { mandateId: bigint }) {
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState("compute");

  let parsed: bigint | undefined;
  try {
    parsed = amount ? parseUnits(amount, 6) : undefined;
  } catch {
    parsed = undefined;
  }
  const valid = parsed !== undefined && isAddress(counterparty) && category.length > 0 && category.length <= 32;

  const { data, isFetching } = useCanSpend(
    valid ? mandateId : undefined,
    valid ? parsed : undefined,
    valid ? (counterparty as `0x${string}`) : undefined,
    valid ? encodeCategory(category) : undefined
  );
  const result = data as readonly [boolean, number] | undefined;

  return (
    <section className="space-y-2">
      <h2 className="font-medium">Check a payment</h2>
      <p className="text-sm text-gray-500">Calls the contract's canSpend. Nothing is sent.</p>
      <div className="grid grid-cols-3 gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="px-3 py-2 border rounded text-sm"
        />
        <input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Counterparty 0x..."
          className="px-3 py-2 border rounded text-sm font-mono"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className="px-3 py-2 border rounded text-sm"
        />
      </div>
      {valid && (
        <p className="text-sm">
          {isFetching || !result ? (
            <span className="text-gray-500">Checking...</span>
          ) : result[0] ? (
            <span className="text-green-700">Allowed</span>
          ) : (
            <span className="text-red-700">Refused: {REASON_CODES[Number(result[1])] || result[1]}</span>
          )}
        </p>
      )}
    </section>
  );
}

function Message({ text }: { text: string }) {
  return <div className="p-8 text-center text-gray-500">{text}</div>;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-gray-500">{label}</span>
      <p className={`break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
