"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useMandateRead, useMandateWrite } from "@/hooks/useMandate";
import { REASON_CODES, ERC20_ABI, MANDATE_ABI, encodeCategory } from "@lex/sdk";
import { CONTRACTS, EXPLORER_URL, TOKENS } from "@/config/contracts";
import { formatUnits, parseUnits, isAddress } from "viem";

const DECISION_LABELS = ["ALLOW", "REFUSE", "EXCEPTION"];

export function MandateView() {
  const [mandateIdInput, setMandateIdInput] = useState("");
  const [mandateId, setMandateId] = useState<bigint>();
  const { address } = useAccount();
  const { data, isLoading, refetch } = useMandateRead(mandateId);
  const { writeContract, mandateAddress, mandateAbi, isPending, isConfirming, isSuccess, hash } =
    useMandateWrite();

  const {data: guardianAddr} = useReadContract({address: CONTRACTS.mandate, abi: MANDATE_ABI, functionName: "guardian", args: mandateId !== undefined ? [mandateId] : undefined, query: {enabled: mandateId !== undefined}});
  const {data: heartbeatSilence} = useReadContract({address: CONTRACTS.mandate, abi: MANDATE_ABI, functionName: "heartbeatMaxSilence", args: mandateId !== undefined ? [mandateId] : undefined, query: {enabled: mandateId !== undefined}});
  const [capAgent, setCapAgent] = useState("");
  const [capValue, setCapValue] = useState("");
  const [envCategory, setEnvCategory] = useState("compute");
  const [envBudget, setEnvBudget] = useState("");
  const [hbSeconds, setHbSeconds] = useState("");
  const [guardianInput, setGuardianInput] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [agentAddr, setAgentAddr] = useState("");
  const [revokeAddr, setRevokeAddr] = useState("");
  const [tierAddr, setTierAddr] = useState("");
  const [tierValue, setTierValue] = useState("");
  const [tab, setTab] = useState<"overview" | "agents" | "limits" | "fund" | "withdraw" | "exceptions">("overview");

  const handleLoad = () => {
    if (mandateIdInput) setMandateId(BigInt(mandateIdInput));
  };

  if (!mandateId || !data) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-medium">View Mandate</h2>
        <div className="flex gap-2">
          <input
            type="number"
            value={mandateIdInput}
            onChange={(e) => setMandateIdInput(e.target.value)}
            placeholder="Mandate ID"
            className="px-3 py-2 border rounded w-40"
          />
          <button onClick={handleLoad} className="px-4 py-2 bg-black text-white rounded">
            Load
          </button>
        </div>
      </div>
    );
  }

  const [owner, paused, token, balance, policyHash, rules] = data as any;
  const isOwner = address?.toLowerCase() === owner?.toLowerCase();
  const tokenSymbol = token?.toLowerCase() === TOKENS.USDC_E.toLowerCase() ? "USDC.e" : "USDT";

  const handleFund = () => {
    if (!fundAmount || !mandateId) return;
    const amount = BigInt(Math.floor(Number(fundAmount) * 1e6));

    // Approve first
    writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [mandateAddress, amount],
    });

    // Then fund (user will need to confirm second tx after first)
    setTimeout(() => {
      writeContract({
        address: mandateAddress,
        abi: mandateAbi,
        functionName: "fund",
        args: [mandateId, amount],
      });
    }, 1000);
  };

  const handleBindAgent = () => {
    if (!agentAddr || !mandateId) return;
    writeContract({
      address: mandateAddress,
      abi: mandateAbi,
      functionName: "bindAgent",
      args: [mandateId, agentAddr as `0x${string}`],
    });
  };

  const handlePause = () => {
    if (!mandateId) return;
    writeContract({
      address: mandateAddress,
      abi: mandateAbi,
      functionName: paused ? "unpause" : "pause",
      args: [mandateId],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Mandate #{mandateId.toString()}</h2>
        <div className="flex gap-2">
          {paused && (
            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">PAUSED</span>
          )}
          {isOwner && (
            <button
              onClick={handlePause}
              className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            >
              {paused ? "Unpause" : "Pause"}
            </button>
          )}
          <button onClick={() => refetch()} className="px-3 py-1 border rounded text-sm">
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["overview", "agents", "limits", "fund", "withdraw", "exceptions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${
              tab === t ? "border-b-2 border-black font-medium" : "text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-gray-500">Owner</span>
              <p className="font-mono text-xs break-all">{owner}</p>
            </div>
            <div>
              <span className="text-gray-500">Balance</span>
              <p>
                {formatUnits(balance, 6)} {tokenSymbol}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Per-tx cap</span>
              <p>{formatUnits(rules.perTxCap, 6)}</p>
            </div>
            <div>
              <span className="text-gray-500">Rolling 24h cap</span>
              <p>{formatUnits(rules.rollingWindowCap, 6)}</p>
            </div>
            <div>
              <span className="text-gray-500">Per-counterparty cap</span>
              <p>{formatUnits(rules.perCounterpartyCap, 6)}</p>
            </div>
            <div>
              <span className="text-gray-500">Per-category cap</span>
              <p>{formatUnits(rules.perCategoryCap, 6)}</p>
            </div>
            <div>
              <span className="text-gray-500">Cooldown</span>
              <p>{rules.cooldownSeconds.toString()}s</p>
            </div>
            <div>
              <span className="text-gray-500">Exception mode</span>
              <p>{Number(rules.exceptionMode) === 0 ? "Hard law" : "Governed"}</p>
            </div>
            <div>
              <span className="text-gray-500">Absolute ceiling</span>
              <p>{formatUnits(rules.absoluteCeiling, 6)}</p>
            </div>
            <div>
              <span className="text-gray-500">Rule change timelock</span>
              <p>{rules.timelockForRuleChange.toString()}s</p>
            </div>
            <div><span className="text-gray-500">Heartbeat</span><p>{heartbeatSilence && heartbeatSilence > 0n ? `every ${heartbeatSilence}s` : "off"}</p></div>
            <div><span className="text-gray-500">Guardian</span><p className="font-mono text-xs break-all">{guardianAddr || "none"}</p></div>
            {(rules.activeWindowStart > 0n || rules.activeWindowEnd > 0n) && (
              <>
                <div>
                  <span className="text-gray-500">Active window start</span>
                  <p>{rules.activeWindowStart.toString()}s from midnight</p>
                </div>
                <div>
                  <span className="text-gray-500">Active window end</span>
                  <p>{rules.activeWindowEnd.toString()}s from midnight</p>
                </div>
              </>
            )}
          </div>
          <div>
            <span className="text-gray-500">Policy hash</span>
            <p className="font-mono text-xs break-all">{policyHash}</p>
          </div>
        </div>
      )}

      {tab === "agents" && isOwner && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Bind agent</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={agentAddr}
                onChange={(e) => setAgentAddr(e.target.value)}
                placeholder="Agent address (0x...)"
                className="flex-1 px-3 py-2 border rounded font-mono text-sm"
              />
              <button
                onClick={handleBindAgent}
                disabled={isPending || isConfirming}
                className="px-4 py-2 bg-black text-white rounded text-sm disabled:opacity-50"
              >
                Bind
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              Counterparty tier (spends need tier ≥ {rules.minCounterpartyTier.toString()})
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={tierAddr}
                onChange={(e) => setTierAddr(e.target.value)}
                placeholder="Counterparty (0x...)"
                className="flex-1 px-3 py-2 border rounded font-mono text-sm"
              />
              <input
                type="number"
                value={tierValue}
                onChange={(e) => setTierValue(e.target.value)}
                placeholder="Tier"
                className="w-20 px-3 py-2 border rounded text-sm"
              />
              <button
                onClick={() => {
                  if (!tierAddr || tierValue === "" || !mandateId) return;
                  writeContract({
                    address: mandateAddress,
                    abi: mandateAbi,
                    functionName: "setCounterpartyTier",
                    args: [mandateId, tierAddr as `0x${string}`, BigInt(tierValue)],
                  });
                }}
                disabled={isPending || isConfirming}
                className="px-4 py-2 bg-black text-white rounded text-sm disabled:opacity-50"
              >
                Set
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Revoke agent</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={revokeAddr}
                onChange={(e) => setRevokeAddr(e.target.value)}
                placeholder="Agent address (0x...)"
                className="flex-1 px-3 py-2 border rounded font-mono text-sm"
              />
              <button
                onClick={() => {
                  if (!revokeAddr || !mandateId) return;
                  writeContract({
                    address: mandateAddress,
                    abi: mandateAbi,
                    functionName: "revokeAgent",
                    args: [mandateId, revokeAddr as `0x${string}`],
                  });
                }}
                disabled={isPending || isConfirming}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "limits" && isOwner && (
        <div className="space-y-5">
          <LimitRow label="Agent sub-cap per window (0 = off)" busy={isPending || isConfirming} fields={[
            {value: capAgent, set: setCapAgent, placeholder: "Agent (0x...)"}, {value: capValue, set: setCapValue, placeholder: "Cap"}
          ]} onSubmit={() => { if (!isAddress(capAgent) || capValue === "") return; writeContract({address: mandateAddress, abi: mandateAbi, functionName: "setAgentCap", args: [mandateId, capAgent, parseUnits(capValue, 6)]}); }} />
          <LimitRow label="Category envelope, total budget (0 = remove)" busy={isPending || isConfirming} fields={[
            {value: envCategory, set: setEnvCategory, placeholder: "Category"}, {value: envBudget, set: setEnvBudget, placeholder: "Budget"}
          ]} onSubmit={() => { if (!envCategory || new TextEncoder().encode(envCategory).length > 32 || envBudget === "") return; writeContract({address: mandateAddress, abi: mandateAbi, functionName: "setEnvelope", args: [mandateId, encodeCategory(envCategory), parseUnits(envBudget, 6)]}); }} />
          <LimitRow label="Heartbeat seconds (0 = off)" busy={isPending || isConfirming} fields={[
            {value: hbSeconds, set: setHbSeconds, placeholder: "Seconds"}
          ]} onSubmit={() => { if (!/^\d+$/.test(hbSeconds)) return; writeContract({address: mandateAddress, abi: mandateAbi, functionName: "setHeartbeatPolicy", args: [mandateId, BigInt(hbSeconds)]}); }} />
          <LimitRow label="Guardian (zero address removes it)" busy={isPending || isConfirming} fields={[
            {value: guardianInput, set: setGuardianInput, placeholder: "Guardian (0x...)"}
          ]} onSubmit={() => { if (!isAddress(guardianInput)) return; writeContract({address: mandateAddress, abi: mandateAbi, functionName: "setGuardian", args: [mandateId, guardianInput]}); }} />
        </div>
      )}

      {tab === "fund" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="number"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder={`Amount (${tokenSymbol})`}
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={handleFund}
              disabled={isPending || isConfirming}
              className="px-4 py-2 bg-black text-white rounded text-sm disabled:opacity-50"
            >
              {isPending ? "Confirm..." : "Fund"}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Two transactions: approve + fund. Confirm both in your wallet.
          </p>
        </div>
      )}

      {tab === "withdraw" && isOwner && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Withdraw unspent funds back to your wallet. Balance: {formatUnits(balance, 6)} {tokenSymbol}
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={`Amount (${tokenSymbol})`}
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={() => {
                if (!withdrawAmount || !mandateId) return;
                const amount = BigInt(Math.floor(Number(withdrawAmount) * 1e6));
                writeContract({
                  address: mandateAddress,
                  abi: mandateAbi,
                  functionName: "withdraw",
                  args: [mandateId, amount],
                });
              }}
              disabled={isPending || isConfirming}
              className="px-4 py-2 bg-black text-white rounded text-sm disabled:opacity-50"
            >
              Withdraw
            </button>
          </div>
        </div>
      )}

      {tab === "exceptions" && (
        <div className="text-sm text-gray-500">
          Exception queue — approve or reject pending exceptions here.
          {Number(rules.exceptionMode) === 0 && (
            <p className="mt-2">This mandate uses hard law. No exceptions are possible.</p>
          )}
        </div>
      )}

      {isSuccess && hash && (
        <p className="text-sm text-green-600">
          Done.{" "}
          <a
            href={`${EXPLORER_URL}/tx/${hash}`}
            target="_blank"
            rel="noopener"
            className="underline"
          >
            View tx
          </a>
        </p>
      )}
    </div>
  );
}

function LimitRow({label, fields, onSubmit, busy}: {label: string; fields: {value: string; set: (v: string) => void; placeholder: string}[]; onSubmit: () => void; busy: boolean}) {
  return <div className="space-y-2"><p className="text-sm text-gray-500">{label}</p><div className="flex gap-2">{fields.map(f => <input key={f.placeholder} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className="min-w-0 flex-1 px-3 py-2 border rounded text-sm"/>)}<button type="button" onClick={onSubmit} disabled={busy} className="px-4 py-2 bg-black text-white rounded text-sm disabled:opacity-50">Set</button></div></div>;
}
