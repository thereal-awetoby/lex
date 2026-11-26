import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Lex, encodeCategory, REASON_CODES, payHspCart, type HspCartMandate } from "@lex/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MANDATE_ADDRESS = process.env.LEX_MANDATE_ADDRESS as `0x${string}`;
const RPC_URL = process.env.HSK_RPC_URL || "https://mainnet.hsk.xyz";
const AGENT_KEY = process.env.LEX_AGENT_PRIVATE_KEY as `0x${string}` | undefined;

const lex = new Lex({ mandateAddress: MANDATE_ADDRESS, rpcUrl: RPC_URL });

if (AGENT_KEY) {
  const account = privateKeyToAccount(AGENT_KEY);
  const chain = lex.publicClient.chain!;
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(RPC_URL),
  });
  lex.connect(wallet);
}

const server = new Server(
  { name: "lex-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_mandate",
      description: "Get mandate details including rules, balance, and status",
      inputSchema: {
        type: "object" as const,
        properties: {
          mandateId: { type: "string", description: "Mandate ID" },
        },
        required: ["mandateId"],
      },
    },
    {
      name: "can_pay",
      description: "Check if a spend would be allowed under the mandate rules. Free call, no gas.",
      inputSchema: {
        type: "object" as const,
        properties: {
          mandateId: { type: "string", description: "Mandate ID" },
          amount: { type: "string", description: "Amount in token smallest unit (e.g. 1000000 for 1 USDC)" },
          counterparty: { type: "string", description: "Counterparty address" },
          category: { type: "string", description: "Category name: compute, data, freelance, other" },
        },
        required: ["mandateId", "amount", "counterparty", "category"],
      },
    },
    {
      name: "pay",
      description: "Execute a spend under the mandate. Requires agent key.",
      inputSchema: {
        type: "object" as const,
        properties: {
          mandateId: { type: "string", description: "Mandate ID" },
          amount: { type: "string", description: "Amount in token smallest unit" },
          counterparty: { type: "string", description: "Counterparty address" },
          category: { type: "string", description: "Category name" },
          ref: { type: "string", description: "Reference hash (invoice/order id)" },
          hspOrderId: { type: "string", description: "HSP order ID if using HSP rail" },
        },
        required: ["mandateId", "amount", "counterparty", "category"],
      },
    },
    {
      name: "request_exception",
      description: "Request an exception for a spend that exceeds mandate limits (governed mode only)",
      inputSchema: {
        type: "object" as const,
        properties: {
          mandateId: { type: "string", description: "Mandate ID" },
          amount: { type: "string", description: "Amount" },
          counterparty: { type: "string", description: "Counterparty address" },
          category: { type: "string", description: "Category name" },
          reason: { type: "string", description: "Reason for exception" },
        },
        required: ["mandateId", "amount", "counterparty", "category", "reason"],
      },
    },
    {
      name: "get_receipt",
      description: "Get a receipt by ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          receiptId: { type: "string", description: "Receipt ID" },
        },
        required: ["receiptId"],
      },
    },
    {
      name: "list_receipts",
      description: "List spend decisions for a mandate",
      inputSchema: {
        type: "object" as const,
        properties: {
          mandateId: { type: "string", description: "Mandate ID" },
          fromBlock: { type: "string", description: "Start block (default 0)" },
        },
        required: ["mandateId"],
      },
    },
    {
      name: "get_exception",
      description: "Get exception request details",
      inputSchema: {
        type: "object" as const,
        properties: {
          exceptionId: { type: "string", description: "Exception ID" },
        },
        required: ["exceptionId"],
      },
    },
    {
      name: "pay_hsp_cart",
      description:
        "Pay an HSP (HashKey Settlement Protocol) Cart Mandate through the Lex mandate. Checks cart hash, expiry, chain and token first. The mandate rules still decide; the receipt records the HSP payment request id.",
      inputSchema: {
        type: "object" as const,
        properties: {
          mandateId: { type: "string", description: "Mandate ID" },
          cartMandate: { type: "string", description: "HSP Cart Mandate as JSON (contents + merchant_authorization)" },
          category: { type: "string", description: "Spend category, e.g. compute, data" },
          merchantSigner: {
            type: "string",
            description:
              "Merchant signer address; the ES256K signature must recover to it. Defaults to LEX_HSP_MERCHANT_SIGNER.",
          },
        },
        required: ["mandateId", "cartMandate", "category"],
      },
    },
    {
      name: "get_escrow",
      description: "Get escrow details",
      inputSchema: {
        type: "object" as const,
        properties: {
          escrowId: { type: "string", description: "Escrow ID" },
        },
        required: ["escrowId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_mandate": {
        const info = await lex.getMandate(BigInt(args!.mandateId as string));
        return { content: [{ type: "text", text: JSON.stringify(info, replacer, 2) }] };
      }

      case "can_pay": {
        const result = await lex.canSpend(
          BigInt(args!.mandateId as string),
          BigInt(args!.amount as string),
          args!.counterparty as `0x${string}`,
          encodeCategory(args!.category as string)
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "pay": {
        const ref = (args!.ref as string) || "0x0000000000000000000000000000000000000000000000000000000000000000";
        const hspOrderId = (args!.hspOrderId as string) || "0x0000000000000000000000000000000000000000000000000000000000000000";
        const result = await lex.spend(
          BigInt(args!.mandateId as string),
          BigInt(args!.amount as string),
          args!.counterparty as `0x${string}`,
          encodeCategory(args!.category as string),
          ref as `0x${string}`,
          hspOrderId as `0x${string}`
        );
        const receipt = await lex.getReceipt(result.receiptId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { ...result, receipt, receiptId: result.receiptId.toString() },
                replacer,
                2
              ),
            },
          ],
        };
      }

      case "request_exception": {
        const result = await lex.requestException(
          BigInt(args!.mandateId as string),
          BigInt(args!.amount as string),
          args!.counterparty as `0x${string}`,
          encodeCategory(args!.category as string),
          args!.reason as string
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, replacer, 2) }],
        };
      }

      case "get_receipt": {
        const receipt = await lex.getReceipt(BigInt(args!.receiptId as string));
        return { content: [{ type: "text", text: JSON.stringify(receipt, replacer, 2) }] };
      }

      case "list_receipts": {
        const logs = await lex.getSpendDecisions(
          BigInt(args!.mandateId as string),
          BigInt(args!.fromBlock as string || "0")
        );
        const formatted = logs.map((l: any) => ({
          receiptId: l.args.receiptId?.toString(),
          decision: ["ALLOW", "REFUSE", "EXCEPTION"][Number(l.args.decision)],
          reasonCode: REASON_CODES[Number(l.args.reasonCode)] || l.args.reasonCode,
          amount: l.args.amount?.toString(),
          counterparty: l.args.counterparty,
          blockNumber: l.blockNumber?.toString(),
        }));
        return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
      }

      case "get_exception": {
        const ex = await lex.getException(BigInt(args!.exceptionId as string));
        return { content: [{ type: "text", text: JSON.stringify(ex, replacer, 2) }] };
      }

      case "pay_hsp_cart": {
        const cart = JSON.parse(args!.cartMandate as string) as HspCartMandate;
        const result = await payHspCart(lex, BigInt(args!.mandateId as string), cart, {
          category: encodeCategory(args!.category as string),
          merchantSigner:
            ((args!.merchantSigner as `0x${string}`) || (process.env.LEX_HSP_MERCHANT_SIGNER as `0x${string}`)) ||
            undefined,
          allowUnverifiedMerchant: process.env.LEX_HSP_ALLOW_UNVERIFIED === "true",
        });
        if (!result.check.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ paid: false, errors: result.check.errors }, null, 2) }],
            isError: true,
          };
        }
        const receipt = await lex.getReceipt(result.receiptId!);
        const decision = ["ALLOW", "REFUSE", "EXCEPTION"][Number(receipt.decision)];
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  decision,
                  reason: REASON_CODES[Number(receipt.reasonCode)],
                  paid: decision !== "REFUSE",
                  paymentRequestId: result.check.paymentRequestId,
                  receiptId: result.receiptId,
                  txHash: result.txHash,
                },
                replacer,
                2
              ),
            },
          ],
          isError: decision === "REFUSE",
        };
      }

      case "get_escrow": {
        const escrow = await lex.getEscrow(BigInt(args!.escrowId as string));
        return { content: [{ type: "text", text: JSON.stringify(escrow, replacer, 2) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

function replacer(_key: string, value: any) {
  return typeof value === "bigint" ? value.toString() : value;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
