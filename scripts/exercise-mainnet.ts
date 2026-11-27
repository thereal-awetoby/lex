/**
 * Runs the Lex lifecycle against a deployed Mandate contract, checks every
 * decision against the expected result, and prints a proof table for
 * docs/MAINNET_PROOFS.md. Exits non-zero if any decision is not what it should be.
 *
 * Works on HSK mainnet (177), testnet (133) or a local node.
 *
 * Env:
 *   HSK_RPC_URL           RPC endpoint (default https://mainnet.hsk.xyz)
 *   LEX_MANDATE_ADDRESS   deployed Mandate contract
 *   DEPLOYER_PRIVATE_KEY  owner key: needs 5 of the token, plus gas
 *   AGENT_PRIVATE_KEY     agent key: needs gas
 *   TOKEN_ADDRESS         6-decimal token (default: USDC.e on 177, USDC on 133)
 *   COUNTERPARTY          payee (default: the owner, so paid amounts come back)
 *   APP_URL               optional; adds /r/:id receipt links to the table
 */

import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CATEGORIES,
  ExceptionMode,
  HSK_MAINNET,
  HSK_TESTNET,
  HspMerchant,
  Lex,
  REASON_CODES,
  SettlementRail,
  payHspCart,
  type MandateRules,
} from "../sdk/src/index.ts";

const RPC = process.env.HSK_RPC_URL || "https://mainnet.hsk.xyz";
const MANDATE = process.env.LEX_MANDATE_ADDRESS as `0x${string}` | undefined;
const OWNER_KEY = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

const DENYLISTED = "0x000000000000000000000000000000000000dEaD" as const;
const ZERO32 = `0x${"00".repeat(32)}` as Hex;
const DECISIONS = ["ALLOW", "REFUSE", "EXCEPTION"];

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const units = (v: string) => parseUnits(v, 6);

interface Row {
  step: string;
  decision: string;
  reason: string;
  receiptId?: bigint;
  txHash?: Hex;
  ok: boolean;
}

async function main() {
  if (!MANDATE || !OWNER_KEY || !AGENT_KEY) {
    throw new Error("Set LEX_MANDATE_ADDRESS, DEPLOYER_PRIVATE_KEY and AGENT_PRIVATE_KEY");
  }

  // Build the chain from the RPC so the same run works on mainnet, testnet or a local node
  const chainId = await createPublicClient({ transport: http(RPC) }).getChainId();
  const chain: Chain = {
    id: chainId,
    name: `HashKey Chain (${chainId})`,
    nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  };
  const explorer =
    chainId === HSK_MAINNET.id ? HSK_MAINNET.explorerUrl : chainId === HSK_TESTNET.id ? HSK_TESTNET.explorerUrl : "";
  const defaultToken =
    chainId === HSK_MAINNET.id ? HSK_MAINNET.tokens.USDC_E : chainId === HSK_TESTNET.id ? HSK_TESTNET.tokens.USDC_E : "";
  const tokenEnv = process.env.TOKEN_ADDRESS || defaultToken;
  if (!tokenEnv) throw new Error(`Set TOKEN_ADDRESS for chain ${chainId}`);
  const token = getAddress(tokenEnv);

  const owner = privateKeyToAccount(OWNER_KEY);
  const agent = privateKeyToAccount(AGENT_KEY);
  const counterparty = getAddress(process.env.COUNTERPARTY || owner.address);

  const ownerLex = new Lex({ mandateAddress: MANDATE, rpcUrl: RPC, chain }).connect(
    createWalletClient({ account: owner, chain, transport: http(RPC) })
  );
  const agentLex = new Lex({ mandateAddress: MANDATE, rpcUrl: RPC, chain }).connect(
    createWalletClient({ account: agent, chain, transport: http(RPC) })
  );
  const relayer = privateKeyToAccount(RELAYER_KEY || OWNER_KEY);
  const relayerLex = new Lex({mandateAddress: MANDATE, rpcUrl: RPC, chain}).connect(createWalletClient({account: relayer, chain, transport: http(RPC)}));
  const client = ownerLex.publicClient;

  // ── Preflight ──────────────────────────────────────────────────────
  const [decimals, symbol, tokenBalance] = await Promise.all([
    client.readContract({ address: token, abi: ERC20, functionName: "decimals" }),
    client.readContract({ address: token, abi: ERC20, functionName: "symbol" }),
    client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [owner.address] }),
  ]);
  if (decimals !== 6) throw new Error(`${symbol} has ${decimals} decimals; this run expects 6`);
  if (tokenBalance < units("5")) {
    throw new Error(`Owner ${owner.address} holds ${formatUnits(tokenBalance, 6)} ${symbol}; needs 5`);
  }
  for (const [name, address] of [
    ["owner", owner.address],
    ["agent", agent.address],
    ["relayer", relayer.address],
  ] as const) {
    if ((await client.getBalance({ address })) === 0n) throw new Error(`${name} ${address} has no HSK for gas`);
  }
  console.log(`Chain ${chainId}, Mandate ${MANDATE}, token ${symbol} ${token}`);
  console.log(`Owner ${owner.address}, agent ${agent.address}, counterparty ${counterparty}\n`);

  const rows: Row[] = [];

  /** Reads the receipt from the chain and compares it with the expected decision and reason */
  const record = async (step: string, txHash: Hex | undefined, receiptId?: bigint, expect?: [string, string]) => {
    let decision = "-";
    let reason = "-";
    if (receiptId !== undefined) {
      const r = await ownerLex.getReceipt(receiptId);
      decision = DECISIONS[Number(r.decision)] ?? "?";
      reason = REASON_CODES[Number(r.reasonCode)] ?? String(r.reasonCode);
    }
    const ok = !expect || (decision === expect[0] && reason === expect[1]);
    rows.push({ step, decision, reason, receiptId, txHash, ok });
    const shown = receiptId === undefined ? "" : ` -> ${decision}${decision === "REFUSE" ? ` ${reason}` : ""}`;
    const expected = ok || !expect ? "" : ` (expected ${expect[0]} ${expect[1]})`;
    console.log(`${ok ? "ok  " : "FAIL"} ${step}${shown}${expected}`);
  };

  const rules: MandateRules = {
    perTxCap: units("1"),
    rollingWindowCap: units("5"),
    rollingWindowDuration: 86400n,
    perCounterpartyCap: units("5"),
    perCategoryCap: units("5"),
    cooldownSeconds: 0n,
    activeWindowStart: 0n,
    activeWindowEnd: 0n,
    minCounterpartyTier: 0n,
    absoluteCeiling: units("2"),
    exceptionMode: ExceptionMode.HARD_LAW,
    preferredRail: SettlementRail.DIRECT,
    exceptionApprovalThreshold: 0,
    exceptionTimeDelay: 0n,
    timelockForRuleChange: 0n,
  };

  const pay = (mandateId: bigint, amount: string, to: `0x${string}`) =>
    agentLex.spend(mandateId, units(amount), to, CATEGORIES.COMPUTE, ZERO32, ZERO32);

  // ── Hard-law mandate ───────────────────────────────────────────────
  const a = await ownerLex.createMandate({
    rules,
    token,
    agents: [agent.address],
    allowlist: [counterparty],
    denylist: [DENYLISTED],
    approvers: [],
  });
  await record(`Create hard-law mandate #${a.mandateId}: 1 per payment, 5 per 24h, ceiling 2`, a.txHash);
  await record(`Fund mandate #${a.mandateId} with 3 ${symbol}`, await ownerLex.fund(a.mandateId, units("3")));

  let s = await pay(a.mandateId, "0.5", counterparty);
  await record("Agent pays 0.5", s.txHash, s.receiptId, ["ALLOW", "OK"]);

  s = await pay(a.mandateId, "1.5", counterparty);
  await record("Agent pays 1.5, over the per-payment cap", s.txHash, s.receiptId, ["REFUSE", "OVER_TX_CAP"]);

  s = await pay(a.mandateId, "0.1", DENYLISTED);
  await record("Agent pays a denylisted address", s.txHash, s.receiptId, ["REFUSE", "DENYLISTED"]);

  await record("Owner pauses the mandate", await ownerLex.pause(a.mandateId));
  s = await pay(a.mandateId, "0.1", counterparty);
  await record("Agent pays while paused", s.txHash, s.receiptId, ["REFUSE", "PAUSED"]);
  await record("Owner unpauses", await ownerLex.unpause(a.mandateId));

  // ── Escrow ─────────────────────────────────────────────────────────
  const refusedEscrow = await agentLex.payWithEscrow(a.mandateId, counterparty, units("1.5"), ZERO32, ZERO32, 3600n);
  await record("Agent tries to lock 1.5 in escrow, over the per-payment cap", refusedEscrow.txHash, refusedEscrow.receiptId, ["REFUSE", "OVER_TX_CAP"]);
  if (refusedEscrow.escrowId !== undefined) throw new Error("refused escrow unexpectedly locked funds");

  const escrow = await agentLex.payWithEscrow(a.mandateId, counterparty, units("0.5"), ZERO32, ZERO32, 3600n);
  await record(`Agent locks 0.5 in escrow #${escrow.escrowId}`, escrow.txHash, escrow.receiptId, ["ALLOW", "OK"]);
  if (escrow.escrowId === undefined) throw new Error("escrow was not locked");
  await record("Agent attests delivery", await agentLex.attestEscrow(escrow.escrowId));
  await record("Escrow released to the counterparty", await agentLex.releaseEscrow(escrow.escrowId));

  // ── HSP cart ───────────────────────────────────────────────────────
  // The owner key signs the cart as the merchant. No HSP merchant API call is made:
  // this proves cart verification and payment through the mandate, and that the
  // receipt carries the HSP order id. The network label is informational here.
  const merchant = new HspMerchant({
    baseUrl: "",
    appKey: "",
    appSecret: "",
    merchantName: "Lex exercise",
    merchantPrivateKey: OWNER_KEY,
    network: chainId === HSK_TESTNET.id ? "hashkey-testnet" : "hashkey",
    chainId,
  });
  const paymentRequestId = `lex-exercise-${Date.now()}`;
  const cart = await merchant.buildCartMandate({
    cartId: `cart-${paymentRequestId}`,
    paymentRequestId,
    payTo: counterparty,
    token,
    coin: symbol,
    amount: "0.25",
    label: "Lex exercise",
  });
  const hsp = await payHspCart(agentLex, a.mandateId, cart, {
    category: CATEGORIES.DATA,
    merchantSigner: owner.address,
  });
  if (!hsp.check.ok || hsp.receiptId === undefined || !hsp.txHash) {
    throw new Error(`HSP cart not paid: ${hsp.check.errors.join(", ")}`);
  }
  await record(`Agent pays HSP cart ${paymentRequestId} (0.25)`, hsp.txHash, hsp.receiptId, ["ALLOW", "OK"]);
  const hspReceipt = await ownerLex.getReceipt(hsp.receiptId);
  if (hspReceipt.hspOrderId.toLowerCase() !== hsp.check.hspOrderId.toLowerCase()) {
    throw new Error("HSP receipt does not carry the order id");
  }

  await record("Owner sets agent sub-cap to 1.5", await ownerLex.setAgentCap(a.mandateId, agent.address, units("1.5")));
  s = await pay(a.mandateId, "0.5", counterparty);
  await record("Agent exceeds sub-cap", s.txHash, s.receiptId, ["REFUSE", "OVER_AGENT_CAP"]);
  await record("Owner removes sub-cap", await ownerLex.setAgentCap(a.mandateId, agent.address, 0n));
  await record("Owner sets data envelope to 0.3", await ownerLex.setEnvelope(a.mandateId, CATEGORIES.DATA, units("0.3")));
  s = await agentLex.spend(a.mandateId, units("0.4"), counterparty, CATEGORIES.DATA, ZERO32, ZERO32);
  await record("Agent exceeds envelope", s.txHash, s.receiptId, ["REFUSE", "ENVELOPE_EXCEEDED"]);
  await record("Owner removes envelope", await ownerLex.setEnvelope(a.mandateId, CATEGORIES.DATA, 0n));
  await record("Owner requires heartbeat", await ownerLex.setHeartbeatPolicy(a.mandateId, 3600n));
  s = await pay(a.mandateId, "0.1", counterparty);
  await record("Agent pays without heartbeat", s.txHash, s.receiptId, ["REFUSE", "AGENT_HEARTBEAT_STALE"]);
  await record("Agent sends heartbeat", await agentLex.heartbeat(a.mandateId));
  s = await pay(a.mandateId, "0.1", counterparty);
  await record("Agent pays after heartbeat", s.txHash, s.receiptId, ["ALLOW", "OK"]);
  await record("Owner disables heartbeat", await ownerLex.setHeartbeatPolicy(a.mandateId, 0n));
  const intent = await agentLex.buildSpendIntent({mandateId: a.mandateId, amount: units("0.2"), counterparty, category: CATEGORIES.COMPUTE});
  const signature = await agentLex.signSpendIntent(intent);
  const dryRun = await relayerLex.canExecuteIntent(intent, signature);
  if (!dryRun.ok || dryRun.agent.toLowerCase() !== agent.address.toLowerCase()) throw new Error(`Intent dry run failed: ${dryRun.reason}`);
  const relayed = await relayerLex.executeSpendIntent(intent, signature);
  await record("Relayer submits signed intent", relayed.txHash, relayed.receiptId, ["ALLOW", "OK"]);
  const replay = await relayerLex.canExecuteIntent(intent, signature);
  const replayOk = !replay.ok && replay.reason === "INTENT_USED";
  rows.push({step: "Replay dry run", decision: replay.ok ? "ALLOW" : "REFUSE", reason: replay.reason, ok: replayOk});
  console.log(`${replayOk ? "ok  " : "FAIL"} Replay dry run -> ${replay.reason}`);

  // ── Governed mandate: exception ────────────────────────────────────
  const b = await ownerLex.createMandate({
    rules: { ...rules, exceptionMode: ExceptionMode.GOVERNED, exceptionApprovalThreshold: 1 },
    token,
    agents: [agent.address],
    allowlist: [counterparty],
    denylist: [],
    approvers: [],
  });
  await record(`Create governed mandate #${b.mandateId}: exceptions need 1 approval`, b.txHash);
  await record(`Fund mandate #${b.mandateId} with 2 ${symbol}`, await ownerLex.fund(b.mandateId, units("2")));

  s = await pay(b.mandateId, "1.5", counterparty);
  await record("Agent pays 1.5, over the per-payment cap", s.txHash, s.receiptId, ["REFUSE", "EXCEPTION_REQUIRED"]);
  const exception = await agentLex.requestException(
    b.mandateId,
    units("1.5"),
    counterparty,
    CATEGORIES.COMPUTE,
    "one-off job above the per-payment cap"
  );
  await record(`Agent requests exception #${exception.exceptionId}`, exception.txHash);
  const approval = await ownerLex.approveException(exception.exceptionId);
  await record("Owner approves; the exception pays out", approval.txHash, approval.receiptId, ["EXCEPTION", "OK"]);

  // ── Return unspent funds ───────────────────────────────────────────
  for (const id of [a.mandateId, b.mandateId]) {
    const { balance } = await ownerLex.getMandate(id);
    if (balance > 0n) {
      await record(`Owner withdraws ${formatUnits(balance, 6)} from #${id}`, await ownerLex.withdraw(id, balance));
    }
  }

  // ── Proof table ────────────────────────────────────────────────────
  const txCell = (h?: Hex) => (!h ? "" : explorer ? `[${h.slice(0, 10)}…](${explorer}/tx/${h})` : `\`${h}\``);
  const receiptCell = (id?: bigint) =>
    id === undefined ? "" : APP_URL ? `[#${id}](${APP_URL}/r/${id})` : `#${id}`;

  console.log(`\n### Run on chain ${chainId}, ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(`Mandate contract: \`${MANDATE}\`\n`);
  console.log("| Step | Decision | Reason | Receipt | Tx |");
  console.log("|------|----------|--------|---------|----|");
  for (const r of rows) {
    console.log(`| ${r.step} | ${r.decision} | ${r.reason} | ${receiptCell(r.receiptId)} | ${txCell(r.txHash)} |`);
  }

  const failed = rows.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} step(s) did not match the expected decision`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
