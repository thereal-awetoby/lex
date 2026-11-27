import test from "node:test";
import assert from "node:assert/strict";
import { Lex, relaySpendIntent } from "../dist/index.js";
const address = "0x0000000000000000000000000000000000000001";
const zero = `0x${"00".repeat(32)}`;
const intent = {mandateId: 1n, amount: 2n, counterparty: address, category: zero, ref: zero, hspOrderId: zero, nonce: 3n, deadline: 4n};

test("relay serializes integers and parses receipt id", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, opts) => {
      const payload = JSON.parse(opts.body);
      assert.equal(payload.intent.amount, "2"); assert.equal(payload.intent.nonce, "3");
      return new Response(JSON.stringify({relayed: true, paid: true, decision: "ALLOW", receiptId: "9"}), {status: 200});
    };
    const result = await relaySpendIntent("https://example.test", intent, zero);
    assert.equal(result.relayed, true); assert.equal(result.paid, true); assert.equal(result.receiptId, 9n);
  } finally {globalThis.fetch = original;}
});

test("relayed refusal is not reported as paid", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({relayed: true, paid: false, decision: "REFUSE", reason: "PAUSED", receiptId: "10"}));
    const result = await relaySpendIntent("https://example.test", intent, zero);
    assert.equal(result.relayed, true); assert.equal(result.paid, false); assert.equal(result.reason, "PAUSED");
  } finally {globalThis.fetch = original;}
});

test("HTTP error and invalid receipt do not imply payment", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({relayed: false, paid: true, receiptId: "bad"}), {status: 422});
    const result = await relaySpendIntent("https://example.test", intent, zero);
    assert.equal(result.paid, false); assert.equal(result.receiptId, undefined); assert.equal(result.error, "HTTP 422");
  } finally {globalThis.fetch = original;}
});

test("heartbeat schedule starts immediately, doesn't overlap, and stops", async () => {
  const lex = new Lex({mandateAddress: address});
  let count = 0, finish;
  lex.heartbeat = () => { count++; return new Promise(resolve => {finish = resolve;}); };
  const stop = lex.startHeartbeat(1n, 5);
  await new Promise(r => setTimeout(r, 20)); assert.equal(count, 1);
  stop(); finish(); await new Promise(r => setTimeout(r, 15)); assert.equal(count, 1);
  assert.throws(() => lex.startHeartbeat(1n, 0));
});
