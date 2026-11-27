import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { Lex, MANDATE_ABI } from "../dist/index.js";

const address = "0x0000000000000000000000000000000000000001";
const hash = `0x${"11".repeat(32)}`;
const approveHash = `0x${"22".repeat(32)}`;
const zero = `0x${"00".repeat(32)}`;

function mockLex(status = "reverted") {
  const lex = new Lex({ mandateAddress: address });
  const writes = [];
  lex.connect({ account: { address }, writeContract: async (call) => { writes.push(call); return hash; } });
  lex.publicClient.waitForTransactionReceipt = async () => ({ status, logs: [] });
  lex.getMandate = async () => ({ token: address });
  return { lex, writes };
}

const cases = [
  ["createMandate", [{ rules: {}, token: address }]],
  ["spend", [1n, 2n, address, zero]],
  ["bindAgent", [1n, address]],
  ["revokeAgent", [1n, address]],
  ["rotateAgent", [1n, address, address]],
  ["setAllowlisted", [1n, address, true]],
  ["setDenylisted", [1n, address, true]],
  ["setCounterpartyTier", [1n, address, 2n]],
  ["proposeRules", [1n, {}]],
  ["executeRuleChange", [1n]],
  ["cancelRuleChange", [1n]],
  ["addApprover", [1n, address]],
  ["removeApprover", [1n, address]],
  ["pause", [1n]],
  ["unpause", [1n]],
  ["requestException", [1n, 2n, address, zero, "reason"]],
  ["approveException", [1n]],
  ["executeException", [1n]],
  ["rejectException", [1n]],
  ["payWithEscrow", [1n, address, 2n, zero, zero, 60n]],
  ["attestEscrow", [1n]],
  ["releaseEscrow", [1n]],
  ["refundEscrow", [1n]],
  ["withdraw", [1n, 2n]],
];

for (const [name, args] of cases) {
  test(`${name} rejects a reverted receipt`, async () => {
    const { lex, writes } = mockLex();
    await assert.rejects(lex[name](...args), { message: `Transaction ${hash} reverted` });
    assert.equal(writes.length, 1);
  });
}

test("fund waits for a successful approval before submitting funding", async () => {
  const { lex, writes } = mockLex();
  const events = [];
  let finishApproval;
  const approval = new Promise((resolve) => { finishApproval = resolve; });
  lex.connect({
    account: { address },
    writeContract: async (call) => {
      writes.push(call);
      events.push(`write:${call.functionName}`);
      return call.functionName === "approve" ? approveHash : hash;
    },
  });
  lex.publicClient.waitForTransactionReceipt = async ({ hash: tx }) => {
    events.push(`wait:${tx}`);
    if (tx === approveHash) return approval;
    return { status: "success", logs: [] };
  };
  const funding = lex.fund(1n, 2n);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["write:approve", `wait:${approveHash}`]);
  finishApproval({ status: "success", logs: [] });
  assert.equal(await funding, hash);
  assert.deepEqual(events, ["write:approve", `wait:${approveHash}`, "write:fund", `wait:${hash}`]);
});

test("fund never submits if approval reverts", async () => {
  const { lex, writes } = mockLex();
  await assert.rejects(lex.fund(1n, 2n), { message: `Transaction ${hash} reverted` });
  assert.deepEqual(writes.map((call) => call.functionName), ["approve"]);
});

test("fund propagates a reverted funding transaction after successful approval", async () => {
  const { lex, writes } = mockLex();
  lex.connect({
    account: { address },
    writeContract: async (call) => { writes.push(call); return call.functionName === "approve" ? approveHash : hash; },
  });
  lex.publicClient.waitForTransactionReceipt = async ({ hash: tx }) => ({
    status: tx === approveHash ? "success" : "reverted", logs: [],
  });
  await assert.rejects(lex.fund(1n, 2n), { message: `Transaction ${hash} reverted` });
  assert.deepEqual(writes.map((call) => call.functionName), ["approve", "fund"]);
});

test("successful exception execution still extracts its receipt ID", async () => {
  const { lex } = mockLex("success");
  const topics = encodeEventTopics({
    abi: MANDATE_ABI,
    eventName: "ExceptionSpend",
    args: { mandateId: 1n, exceptionId: 2n, receiptId: 3n },
  });
  lex.publicClient.waitForTransactionReceipt = async () => ({
    status: "success", logs: [{ address, topics, data: "0x" }],
  });
  assert.deepEqual(await lex.executeException(2n), { receiptId: 3n, txHash: hash });
});


function escrowDecisionLog(decision) {
  return {
    address,
    topics: encodeEventTopics({ abi: MANDATE_ABI, eventName: "SpendDecision", args: { mandateId: 1n, receiptId: 7n } }),
    data: encodeAbiParameters([
      { type: "uint8" }, { type: "uint16" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" },
    ], [decision, decision === 0 ? 0 : 2, 5n, address, zero]),
  };
}

test("escrow refusal returns the decision receipt without a lock", async () => {
  const { lex } = mockLex("success");
  lex.publicClient.waitForTransactionReceipt = async () => ({ status: "success", logs: [escrowDecisionLog(1)] });
  assert.deepEqual(await lex.payWithEscrow(1n, address, 5n, zero, zero, 60n), {
    escrowId: undefined, receiptId: 7n, txHash: hash,
  });
});

test("successful escrow returns both receipt and lock IDs", async () => {
  const { lex } = mockLex("success");
  const locked = {
    address,
    topics: encodeEventTopics({ abi: MANDATE_ABI, eventName: "EscrowLocked", args: { mandateId: 1n, escrowId: 3n } }),
    data: encodeAbiParameters([{ type: "uint256" }], [5n]),
  };
  lex.publicClient.waitForTransactionReceipt = async () => ({ status: "success", logs: [escrowDecisionLog(0), locked] });
  assert.deepEqual(await lex.payWithEscrow(1n, address, 5n, zero, zero, 60n), {
    escrowId: 3n, receiptId: 7n, txHash: hash,
  });
});

test("escrow fails closed if the mandate emits no decision", async () => {
  const { lex } = mockLex("success");
  await assert.rejects(lex.payWithEscrow(1n, address, 5n, zero, zero, 60n), /Missing SpendDecision/);
});
