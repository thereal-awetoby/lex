"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { hexToString, parseAbiItem } from "viem";
import { MANDATE_ABI } from "@lex/sdk";
import { CHAIN_ID, CONTRACTS, DEPLOY_BLOCK } from "@/config/contracts";

const AGENT_BOUND = parseAbiItem("event AgentBound(uint256 indexed mandateId, address indexed agent)");
const AGENT_REVOKED = parseAbiItem("event AgentRevoked(uint256 indexed mandateId, address indexed agent)");
const AGENT_ROTATED = parseAbiItem("event AgentRotated(uint256 indexed mandateId, address indexed oldAgent, address indexed newAgent)");
const ENVELOPE_SET = parseAbiItem("event EnvelopeSet(uint256 indexed mandateId, bytes32 indexed category, uint256 budget)");
const ZERO = "0x0000000000000000000000000000000000000000";

type Address = `0x${string}`;
export interface AgentState {address: Address; cap: bigint; spentInWindow: bigint; lastHeartbeat: bigint; stale: boolean}
export interface EnvelopeState {category: Address; label: string; budget: bigint; spent: bigint; remaining: bigint}
export interface MandateState {agents: AgentState[]; envelopes: EnvelopeState[]; guardian?: Address; heartbeatMaxSilence: bigint; timestamp: bigint}
type Ordered = {blockNumber: bigint | null; logIndex: number | null};
const chainOrder = (a: Ordered, b: Ordered) => a.blockNumber === b.blockNumber ? (a.logIndex ?? 0) - (b.logIndex ?? 0) : (a.blockNumber ?? 0n) < (b.blockNumber ?? 0n) ? -1 : 1;
export function categoryLabel(hex: Address): string {
  try { const s = hexToString(hex, {size: 32}).replace(/\0+$/, ""); return s && /^[\x20-\x7e]+$/.test(s) ? s : hex; }
  catch { return hex; }
}

export function useMandateState(mandateId: bigint | undefined, refreshKey?: unknown) {
  const client = usePublicClient({chainId: CHAIN_ID});
  const [state, setState] = useState<MandateState>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    if (!client || mandateId === undefined || !CONTRACTS.mandate) { setState(undefined); return; }
    setLoading(true); setError(undefined); setState(undefined);
    try {
      const block = await client.getBlock();
      const base = {address: CONTRACTS.mandate, args: {mandateId}, fromBlock: DEPLOY_BLOCK, toBlock: block.number} as const;
      const [bound, revoked, rotated, envelopeLogs] = await Promise.all([
        client.getLogs({...base, event: AGENT_BOUND}), client.getLogs({...base, event: AGENT_REVOKED}),
        client.getLogs({...base, event: AGENT_ROTATED}), client.getLogs({...base, event: ENVELOPE_SET}),
      ]);
      const changes = [
        ...bound.map(l => ({...l, apply: (set: Set<string>) => {if (l.args.agent) set.add(l.args.agent.toLowerCase());}})),
        ...revoked.map(l => ({...l, apply: (set: Set<string>) => {if (l.args.agent) set.delete(l.args.agent.toLowerCase());}})),
        ...rotated.map(l => ({...l, apply: (set: Set<string>) => {if (l.args.oldAgent) set.delete(l.args.oldAgent.toLowerCase()); if (l.args.newAgent) set.add(l.args.newAgent.toLowerCase());}})),
      ].sort(chainOrder);
      const agentSet = new Set<string>(); for (const change of changes) change.apply(agentSet);
      const categories = new Set<string>();
      for (const l of [...envelopeLogs].sort(chainOrder)) {
        if (!l.args.category) continue;
        if (l.args.budget === 0n) categories.delete(l.args.category); else categories.add(l.args.category);
      }
      const read = (functionName: string, args: readonly unknown[]) => client.readContract({address: CONTRACTS.mandate, abi: MANDATE_ABI, functionName, args, blockNumber: block.number} as any);
      const [guardian, heartbeatMaxSilence] = await Promise.all([
        read("guardian", [mandateId]) as Promise<Address>, read("heartbeatMaxSilence", [mandateId]) as Promise<bigint>,
      ]);
      const agents = await Promise.all([...agentSet].map(async (a) => {
        const address = a as Address;
        const [[cap, spentInWindow], lastHeartbeat] = await Promise.all([
          read("getAgentCap", [mandateId, address]) as Promise<readonly [bigint, bigint]>, read("lastHeartbeat", [mandateId, address]) as Promise<bigint>,
        ]);
        return {address, cap, spentInWindow, lastHeartbeat, stale: heartbeatMaxSilence > 0n && (lastHeartbeat === 0n || block.timestamp > lastHeartbeat + heartbeatMaxSilence)};
      }));
      const envelopes = await Promise.all([...categories].map(async (c) => {
        const category = c as Address;
        const [budget, spent] = await read("getEnvelope", [mandateId, category]) as readonly [bigint, bigint];
        return {category, label: categoryLabel(category), budget, spent, remaining: spent >= budget ? 0n : budget - spent};
      }));
      if (seq === generation.current) setState({agents, envelopes, guardian: guardian.toLowerCase() === ZERO ? undefined : guardian, heartbeatMaxSilence, timestamp: block.timestamp});
    } catch (e: any) {
      if (seq === generation.current) setError(e?.shortMessage || e?.message || "Failed to load mandate state");
    } finally { if (seq === generation.current) setLoading(false); }
  }, [client, mandateId]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load, refreshKey]);
  return {state, loading, error, reload: load};
}
