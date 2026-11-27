"use client";
import { formatUnits } from "viem";
import { useMandateState } from "@/hooks/useMandateState";

/** Current limits reconstructed from events and read at the same block. */
export function LimitsSummary({mandateId, refreshKey}: {mandateId: bigint; refreshKey?: unknown}) {
  const {state, loading, error} = useMandateState(mandateId, refreshKey);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!state) return <p className="text-sm text-gray-500">{loading ? "Loading limits..." : "Limits unavailable"}</p>;
  const fmt = (n: bigint) => formatUnits(n, 6);
  return <div className="space-y-4 text-sm">
    <div className="grid grid-cols-2 gap-3"><div><span className="text-gray-500">Guardian</span><p className="font-mono text-xs break-all">{state.guardian ?? "none"}</p></div>
      <div><span className="text-gray-500">Heartbeat</span><p>{state.heartbeatMaxSilence ? `every ${state.heartbeatMaxSilence}s` : "off"}</p></div></div>
    <div><p className="text-gray-500 mb-1">Agents</p>{!state.agents.length ? <p>No bound agents found.</p> : <table className="w-full"><thead><tr className="text-left border-b"><th>Agent</th><th>Sub-cap</th><th>Heartbeat</th></tr></thead><tbody>{state.agents.map(a => <tr key={a.address} className="border-b"><td className="font-mono text-xs break-all">{a.address}</td><td>{a.cap === 0n ? "none" : `${fmt(a.spentInWindow)} of ${fmt(a.cap)}`}</td><td className={a.stale ? "text-red-700" : ""}>{state.heartbeatMaxSilence === 0n ? "not required" : a.lastHeartbeat === 0n ? "never checked in" : `${a.stale ? "stale; " : ""}last at ${new Date(Number(a.lastHeartbeat) * 1000).toISOString()}`}</td></tr>)}</tbody></table>}</div>
    <div><p className="text-gray-500 mb-1">Category envelopes</p>{!state.envelopes.length ? <p>None found.</p> : <table className="w-full"><thead><tr className="text-left border-b"><th>Category</th><th>Budget</th><th>Spent</th><th>Left</th></tr></thead><tbody>{state.envelopes.map(e => <tr key={e.category} className="border-b"><td>{e.label}</td><td>{fmt(e.budget)}</td><td>{fmt(e.spent)}</td><td>{fmt(e.remaining)}</td></tr>)}</tbody></table>}</div>
    <p className="text-xs text-gray-500">Lists depend on complete event history from the configured deployment block.</p>
  </div>;
}
