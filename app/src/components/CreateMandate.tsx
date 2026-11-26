"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useMandateWrite } from "@/hooks/useMandate";
import { TOKENS } from "@/config/contracts";
import { encodeCategory } from "@lex/sdk";

export function CreateMandate() {
  const { address } = useAccount();
  const { writeContract, mandateAddress, mandateAbi, isPending, isConfirming, isSuccess, hash } =
    useMandateWrite();

  const [form, setForm] = useState({
    perTxCap: "100",
    rollingWindowCap: "500",
    perCounterpartyCap: "200",
    perCategoryCap: "300",
    cooldownSeconds: "60",
    absoluteCeiling: "1000",
    activeWindowStart: "0",
    activeWindowEnd: "0",
    timelockForRuleChange: "0",
    exceptionMode: "0", // HARD_LAW
    token: TOKENS.USDC_E,
    agent: "",
    allowlist: "",
    denylist: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    const decimals = 6n;
    const toUnits = (val: string) => BigInt(Math.floor(Number(val) * 1e6));

    const rules = {
      perTxCap: toUnits(form.perTxCap),
      rollingWindowCap: toUnits(form.rollingWindowCap),
      rollingWindowDuration: 86400n,
      perCounterpartyCap: toUnits(form.perCounterpartyCap),
      perCategoryCap: toUnits(form.perCategoryCap),
      cooldownSeconds: BigInt(form.cooldownSeconds),
      activeWindowStart: 0n,
      activeWindowEnd: 0n,
      minCounterpartyTier: 0n,
      absoluteCeiling: toUnits(form.absoluteCeiling),
      exceptionMode: Number(form.exceptionMode),
      preferredRail: 0, // HSP
      exceptionApprovalThreshold: form.exceptionMode === "1" ? 1 : 0,
      exceptionTimeDelay: 0n,
      timelockForRuleChange: BigInt(form.timelockForRuleChange),
    };

    const agents = form.agent ? [form.agent as `0x${string}`] : [];
    const allowlistAddrs = form.allowlist
      ? form.allowlist.split(",").map((a) => a.trim() as `0x${string}`)
      : [];
    const denylistAddrs = form.denylist
      ? form.denylist.split(",").map((a) => a.trim() as `0x${string}`)
      : [];

    writeContract({
      address: mandateAddress,
      abi: mandateAbi,
      functionName: "createMandate",
      args: [rules, form.token as `0x${string}`, agents, allowlistAddrs, denylistAddrs, []],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h2 className="text-lg font-medium">Create Mandate</h2>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-gray-500">Per-tx cap (USDC)</span>
          <input
            type="number"
            value={form.perTxCap}
            onChange={(e) => setForm({ ...form, perTxCap: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-500">Rolling 24h cap (USDC)</span>
          <input
            type="number"
            value={form.rollingWindowCap}
            onChange={(e) => setForm({ ...form, rollingWindowCap: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-500">Per-counterparty cap</span>
          <input
            type="number"
            value={form.perCounterpartyCap}
            onChange={(e) => setForm({ ...form, perCounterpartyCap: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-500">Per-category cap</span>
          <input
            type="number"
            value={form.perCategoryCap}
            onChange={(e) => setForm({ ...form, perCategoryCap: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-500">Cooldown (seconds)</span>
          <input
            type="number"
            value={form.cooldownSeconds}
            onChange={(e) => setForm({ ...form, cooldownSeconds: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-500">Exception mode</span>
          <select
            value={form.exceptionMode}
            onChange={(e) => setForm({ ...form, exceptionMode: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          >
            <option value="0">Hard law (no exceptions)</option>
            <option value="1">Governed (exceptions allowed)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-gray-500">Absolute ceiling (USDC)</span>
          <input
            type="number"
            value={form.absoluteCeiling}
            onChange={(e) => setForm({ ...form, absoluteCeiling: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-500">Rule change timelock (sec)</span>
          <input
            type="number"
            value={form.timelockForRuleChange}
            onChange={(e) => setForm({ ...form, timelockForRuleChange: e.target.value })}
            className="w-full mt-1 px-3 py-2 border rounded"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm text-gray-500">Token</span>
        <select
          value={form.token}
          onChange={(e) => setForm({ ...form, token: e.target.value as `0x${string}` })}
          className="w-full mt-1 px-3 py-2 border rounded"
        >
          <option value={TOKENS.USDC_E}>USDC.e</option>
          <option value={TOKENS.USDT}>USDT</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm text-gray-500">Agent address</span>
        <input
          type="text"
          value={form.agent}
          onChange={(e) => setForm({ ...form, agent: e.target.value })}
          placeholder="0x..."
          className="w-full mt-1 px-3 py-2 border rounded font-mono text-sm"
        />
      </label>

      <label className="block">
        <span className="text-sm text-gray-500">Allowlist (comma-separated)</span>
        <input
          type="text"
          value={form.allowlist}
          onChange={(e) => setForm({ ...form, allowlist: e.target.value })}
          placeholder="0x..., 0x..."
          className="w-full mt-1 px-3 py-2 border rounded font-mono text-sm"
        />
      </label>

      <label className="block">
        <span className="text-sm text-gray-500">Denylist (comma-separated)</span>
        <input
          type="text"
          value={form.denylist}
          onChange={(e) => setForm({ ...form, denylist: e.target.value })}
          placeholder="0x..."
          className="w-full mt-1 px-3 py-2 border rounded font-mono text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={isPending || isConfirming || !address}
        className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Confirm in wallet..." : isConfirming ? "Confirming..." : "Create Mandate"}
      </button>

      {isSuccess && hash && (
        <p className="text-sm text-green-600">
          Created.{" "}
          <a
            href={`https://hashkeyscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener"
            className="underline"
          >
            View tx
          </a>
        </p>
      )}
    </form>
  );
}
