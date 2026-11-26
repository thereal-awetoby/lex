import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
  encodeFunctionData,
  decodeFunctionResult,
  parseEventLogs,
  type Log,
  maxUint256,
} from "viem";
import { MANDATE_ABI, ERC20_ABI, FACTORY_ABI } from "./abi.js";
import { HSK_MAINNET, REASON_CODES, encodeCategory } from "./constants.js";

export { MANDATE_ABI, ERC20_ABI, FACTORY_ABI } from "./abi.js";
export {
  HSK_MAINNET,
  HSK_TESTNET,
  REASON_CODES,
  CATEGORIES,
  encodeCategory,
} from "./constants.js";
export * from "./hsp.js";

// ── Types ──────────────────────────────────────────────────────────────

export enum ExceptionMode {
  HARD_LAW = 0,
  GOVERNED = 1,
}
export enum Decision {
  ALLOW = 0,
  REFUSE = 1,
  EXCEPTION = 2,
}
export enum SettlementRail {
  HSP = 0,
  DIRECT = 1,
  HSP_THEN_DIRECT = 2,
}
export enum EscrowState {
  LOCKED = 0,
  ATTESTED = 1,
  RELEASED = 2,
  REFUNDED = 3,
}

export interface MandateRules {
  perTxCap: bigint;
  rollingWindowCap: bigint;
  rollingWindowDuration: bigint;
  perCounterpartyCap: bigint;
  perCategoryCap: bigint;
  cooldownSeconds: bigint;
  activeWindowStart: bigint;
  activeWindowEnd: bigint;
  minCounterpartyTier: bigint;
  absoluteCeiling: bigint;
  exceptionMode: ExceptionMode;
  preferredRail: SettlementRail;
  exceptionApprovalThreshold: number;
  exceptionTimeDelay: bigint;
  timelockForRuleChange: bigint;
}

export interface CanSpendResult {
  ok: boolean;
  reasonCode: number;
  reason: string;
}

export interface Receipt {
  receiptId: bigint;
  mandateId: bigint;
  policyHash: `0x${string}`;
  decision: Decision;
  reasonCode: number;
  amount: bigint;
  token: `0x${string}`;
  counterparty: `0x${string}`;
  category: `0x${string}`;
  ref: `0x${string}`;
  exceptionId: bigint;
  hspOrderId: `0x${string}`;
  txRef: `0x${string}`;
  timestamp: bigint;
}

export interface MandateInfo {
  owner: `0x${string}`;
  paused: boolean;
  token: `0x${string}`;
  balance: bigint;
  policyHash: `0x${string}`;
  rules: MandateRules;
}

export interface CreateMandateParams {
  rules: MandateRules;
  token: `0x${string}`;
  agents?: `0x${string}`[];
  allowlist?: `0x${string}`[];
  denylist?: `0x${string}`[];
  approvers?: `0x${string}`[];
}

// ── SDK ────────────────────────────────────────────────────────────────

export interface LexConfig {
  mandateAddress: `0x${string}`;
  rpcUrl?: string;
  chain?: Chain;
}

export class Lex {
  public readonly mandateAddress: `0x${string}`;
  public readonly publicClient: PublicClient;
  private walletClient?: WalletClient;

  constructor(config: LexConfig) {
    this.mandateAddress = config.mandateAddress;

    const hskChain: Chain = config.chain ?? {
      id: HSK_MAINNET.id,
      name: HSK_MAINNET.name,
      nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
      rpcUrls: {
        default: { http: [config.rpcUrl ?? HSK_MAINNET.rpcUrl] },
      },
      blockExplorers: {
        default: {
          name: "HashKey Scan",
          url: HSK_MAINNET.explorerUrl,
        },
      },
    };

    this.publicClient = createPublicClient({
      chain: hskChain,
      transport: http(config.rpcUrl ?? HSK_MAINNET.rpcUrl),
    });
  }

  /** Attach a wallet for write operations */
  connect(walletClient: WalletClient): this {
    this.walletClient = walletClient;
    return this;
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient) throw new Error("No wallet connected. Call .connect(walletClient) first.");
    return this.walletClient;
  }

  // ── Read methods ───────────────────────────────────────────────────

  async getMandate(mandateId: bigint): Promise<MandateInfo> {
    const result = await this.publicClient.readContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "getMandate",
      args: [mandateId],
    });
    const [owner, paused, token, balance, policyHash, rules] = result as any;
    return { owner, paused, token, balance, policyHash, rules } as MandateInfo;
  }

  async canSpend(
    mandateId: bigint,
    amount: bigint,
    counterparty: `0x${string}`,
    category: `0x${string}`
  ): Promise<CanSpendResult> {
    const result = await this.publicClient.readContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "canSpend",
      args: [mandateId, amount, counterparty, category],
    });
    const [ok, reasonCode] = result as [boolean, number];
    return {
      ok,
      reasonCode,
      reason: REASON_CODES[reasonCode] ?? `UNKNOWN_${reasonCode}`,
    };
  }

  async getReceipt(receiptId: bigint): Promise<Receipt> {
    const result = await this.publicClient.readContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "getReceipt",
      args: [receiptId],
    });
    return result as unknown as Receipt;
  }

  async getException(exceptionId: bigint) {
    return this.publicClient.readContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "getException",
      args: [exceptionId],
    });
  }

  async getEscrow(escrowId: bigint) {
    return this.publicClient.readContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "getEscrow",
      args: [escrowId],
    });
  }

  async isAgentBound(mandateId: bigint, agent: `0x${string}`): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "isAgentBound",
      args: [mandateId, agent],
    }) as Promise<boolean>;
  }

  // ── Write methods ──────────────────────────────────────────────────

  async createMandate(params: CreateMandateParams): Promise<{ mandateId: bigint; txHash: `0x${string}` }> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "createMandate",
      args: [
        params.rules,
        params.token,
        params.agents ?? [],
        params.allowlist ?? [],
        params.denylist ?? [],
        params.approvers ?? [],
      ],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({
      abi: MANDATE_ABI,
      logs: receipt.logs as any,
      eventName: "MandateCreated",
    });
    const mandateId = (logs[0]?.args as any)?.mandateId as bigint;
    return { mandateId, txHash: hash };
  }

  async fund(mandateId: bigint, amount: bigint): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    // First approve token transfer
    const info = await this.getMandate(mandateId);
    await wallet.writeContract({
      address: info.token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.mandateAddress, amount],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });

    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "fund",
      args: [mandateId, amount],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async spend(
    mandateId: bigint,
    amount: bigint,
    counterparty: `0x${string}`,
    category: `0x${string}`,
    ref: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000",
    hspOrderId: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000"
  ): Promise<{ receiptId: bigint; txHash: `0x${string}` }> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "spend",
      args: [mandateId, amount, counterparty, category, ref, hspOrderId],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });

    const txReceipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({
      abi: MANDATE_ABI,
      logs: txReceipt.logs as any,
      eventName: "SpendDecision",
    });
    const receiptId = (logs[0]?.args as any)?.receiptId as bigint;
    return { receiptId, txHash: hash };
  }

  async bindAgent(mandateId: bigint, agent: `0x${string}`): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "bindAgent",
      args: [mandateId, agent],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async revokeAgent(mandateId: bigint, agent: `0x${string}`): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "revokeAgent",
      args: [mandateId, agent],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async rotateAgent(mandateId: bigint, oldAgent: `0x${string}`, newAgent: `0x${string}`): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "rotateAgent",
      args: [mandateId, oldAgent, newAgent],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async setAllowlisted(mandateId: bigint, addr: `0x${string}`, allowed: boolean): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "setAllowlisted",
      args: [mandateId, addr, allowed],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async setDenylisted(mandateId: bigint, addr: `0x${string}`, denied: boolean): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "setDenylisted",
      args: [mandateId, addr, denied],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async setCounterpartyTier(mandateId: bigint, counterparty: `0x${string}`, tier: bigint): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "setCounterpartyTier",
      args: [mandateId, counterparty, tier],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async proposeRules(mandateId: bigint, newRules: MandateRules): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "proposeRules",
      args: [mandateId, newRules],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async pause(mandateId: bigint): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "pause",
      args: [mandateId],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async unpause(mandateId: bigint): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "unpause",
      args: [mandateId],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async requestException(
    mandateId: bigint,
    amount: bigint,
    counterparty: `0x${string}`,
    category: `0x${string}`,
    reason: string
  ): Promise<{ exceptionId: bigint; txHash: `0x${string}` }> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "requestException",
      args: [mandateId, amount, counterparty, category, reason],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    const txReceipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({
      abi: MANDATE_ABI,
      logs: txReceipt.logs as any,
      eventName: "ExceptionRequested",
    });
    const exceptionId = (logs[0]?.args as any)?.exceptionId as bigint;
    return { exceptionId, txHash: hash };
  }

  async approveException(
    exceptionId: bigint,
    hspOrderId: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000"
  ): Promise<{ receiptId: bigint | undefined; txHash: `0x${string}` }> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "approveException",
      args: [exceptionId, hspOrderId],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    const txReceipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({
      abi: MANDATE_ABI,
      logs: txReceipt.logs as any,
      eventName: "ExceptionSpend",
    });
    const receiptId = logs.length > 0 ? ((logs[0]?.args as any)?.receiptId as bigint) : undefined;
    return { receiptId, txHash: hash };
  }

  async rejectException(exceptionId: bigint): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "rejectException",
      args: [exceptionId],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async payWithEscrow(
    mandateId: bigint,
    counterparty: `0x${string}`,
    amount: bigint,
    attestationSchemaId: `0x${string}`,
    ref: `0x${string}`,
    timeout: bigint
  ): Promise<{ escrowId: bigint; txHash: `0x${string}` }> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "payWithEscrow",
      args: [mandateId, counterparty, amount, attestationSchemaId, ref, timeout],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    const txReceipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({
      abi: MANDATE_ABI,
      logs: txReceipt.logs as any,
      eventName: "EscrowLocked",
    });
    const escrowId = (logs[0]?.args as any)?.escrowId as bigint;
    return { escrowId, txHash: hash };
  }

  async withdraw(mandateId: bigint, amount: bigint): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const hash = await wallet.writeContract({
      address: this.mandateAddress,
      abi: MANDATE_ABI,
      functionName: "withdraw",
      args: [mandateId, amount],
      chain: this.publicClient.chain,
      account: wallet.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ── Event queries ──────────────────────────────────────────────────

  async getSpendDecisions(
    mandateId: bigint,
    fromBlock: bigint = 0n
  ): Promise<any[]> {
    const logs = await this.publicClient.getLogs({
      address: this.mandateAddress,
      event: {
        type: "event",
        name: "SpendDecision",
        inputs: [
          { name: "mandateId", type: "uint256", indexed: true },
          { name: "receiptId", type: "uint256", indexed: true },
          { name: "decision", type: "uint8", indexed: false },
          { name: "reasonCode", type: "uint16", indexed: false },
          { name: "amount", type: "uint256", indexed: false },
          { name: "counterparty", type: "address", indexed: false },
          { name: "category", type: "bytes32", indexed: false },
        ],
      },
      args: { mandateId },
      fromBlock,
    });
    return logs;
  }
}
