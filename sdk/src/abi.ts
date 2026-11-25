export const MANDATE_ABI = [
  // ── Create ──
  {
    name: "createMandate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "rules",
        type: "tuple",
        components: [
          { name: "perTxCap", type: "uint256" },
          { name: "rollingWindowCap", type: "uint256" },
          { name: "rollingWindowDuration", type: "uint256" },
          { name: "perCounterpartyCap", type: "uint256" },
          { name: "perCategoryCap", type: "uint256" },
          { name: "cooldownSeconds", type: "uint256" },
          { name: "activeWindowStart", type: "uint256" },
          { name: "activeWindowEnd", type: "uint256" },
          { name: "minCounterpartyTier", type: "uint256" },
          { name: "absoluteCeiling", type: "uint256" },
          { name: "exceptionMode", type: "uint8" },
          { name: "preferredRail", type: "uint8" },
          { name: "exceptionApprovalThreshold", type: "uint8" },
          { name: "exceptionTimeDelay", type: "uint256" },
          { name: "timelockForRuleChange", type: "uint256" },
        ],
      },
      { name: "token", type: "address" },
      { name: "initialAgents", type: "address[]" },
      { name: "initialAllowlist", type: "address[]" },
      { name: "initialDenylist", type: "address[]" },
      { name: "initialApprovers", type: "address[]" },
    ],
    outputs: [{ name: "mandateId", type: "uint256" }],
  },

  // ── Fund ──
  {
    name: "fund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },

  // ── Agent management ──
  {
    name: "bindAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "agent", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "revokeAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "agent", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "rotateAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "oldAgent", type: "address" },
      { name: "newAgent", type: "address" },
    ],
    outputs: [],
  },

  // ── Allowlist / Denylist ──
  {
    name: "setAllowlisted",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "addr", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "setDenylisted",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "addr", type: "address" },
      { name: "denied", type: "bool" },
    ],
    outputs: [],
  },

  // ── Approver management ──
  {
    name: "addApprover",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "approver", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "removeApprover",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "approver", type: "address" },
    ],
    outputs: [],
  },

  // ── Rules ──
  {
    name: "proposeRules",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      {
        name: "newRules",
        type: "tuple",
        components: [
          { name: "perTxCap", type: "uint256" },
          { name: "rollingWindowCap", type: "uint256" },
          { name: "rollingWindowDuration", type: "uint256" },
          { name: "perCounterpartyCap", type: "uint256" },
          { name: "perCategoryCap", type: "uint256" },
          { name: "cooldownSeconds", type: "uint256" },
          { name: "activeWindowStart", type: "uint256" },
          { name: "activeWindowEnd", type: "uint256" },
          { name: "minCounterpartyTier", type: "uint256" },
          { name: "absoluteCeiling", type: "uint256" },
          { name: "exceptionMode", type: "uint8" },
          { name: "preferredRail", type: "uint8" },
          { name: "exceptionApprovalThreshold", type: "uint8" },
          { name: "exceptionTimeDelay", type: "uint256" },
          { name: "timelockForRuleChange", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "executeRuleChange",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "mandateId", type: "uint256" }],
    outputs: [],
  },

  // ── Pause ──
  {
    name: "pause",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "mandateId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "unpause",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "mandateId", type: "uint256" }],
    outputs: [],
  },

  // ── canSpend ──
  {
    name: "canSpend",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "category", type: "bytes32" },
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "reasonCode", type: "uint16" },
    ],
  },

  // ── Spend ──
  {
    name: "spend",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "category", type: "bytes32" },
      { name: "ref", type: "bytes32" },
      { name: "hspOrderId", type: "bytes32" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },

  // ── Exceptions ──
  {
    name: "requestException",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "category", type: "bytes32" },
      { name: "reason", type: "string" },
    ],
    outputs: [{ name: "exceptionId", type: "uint256" }],
  },
  {
    name: "approveException",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exceptionId", type: "uint256" },
      { name: "hspOrderId", type: "bytes32" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
  {
    name: "rejectException",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "exceptionId", type: "uint256" }],
    outputs: [],
  },

  // ── Escrow ──
  {
    name: "payWithEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "attestationSchemaId", type: "bytes32" },
      { name: "ref", type: "bytes32" },
      { name: "timeout", type: "uint256" },
    ],
    outputs: [{ name: "escrowId", type: "uint256" }],
  },
  {
    name: "attestEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "releaseEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "refundEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },

  // ── Withdraw ──
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },

  // ── Getters ──
  {
    name: "getMandate",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "mandateId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "paused", type: "bool" },
      { name: "token", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "policyHash", type: "bytes32" },
      {
        name: "rules",
        type: "tuple",
        components: [
          { name: "perTxCap", type: "uint256" },
          { name: "rollingWindowCap", type: "uint256" },
          { name: "rollingWindowDuration", type: "uint256" },
          { name: "perCounterpartyCap", type: "uint256" },
          { name: "perCategoryCap", type: "uint256" },
          { name: "cooldownSeconds", type: "uint256" },
          { name: "activeWindowStart", type: "uint256" },
          { name: "activeWindowEnd", type: "uint256" },
          { name: "minCounterpartyTier", type: "uint256" },
          { name: "absoluteCeiling", type: "uint256" },
          { name: "exceptionMode", type: "uint8" },
          { name: "preferredRail", type: "uint8" },
          { name: "exceptionApprovalThreshold", type: "uint8" },
          { name: "exceptionTimeDelay", type: "uint256" },
          { name: "timelockForRuleChange", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getReceipt",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "receiptId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "receiptId", type: "uint256" },
          { name: "mandateId", type: "uint256" },
          { name: "policyHash", type: "bytes32" },
          { name: "decision", type: "uint8" },
          { name: "reasonCode", type: "uint16" },
          { name: "amount", type: "uint256" },
          { name: "token", type: "address" },
          { name: "counterparty", type: "address" },
          { name: "category", type: "bytes32" },
          { name: "ref", type: "bytes32" },
          { name: "exceptionId", type: "uint256" },
          { name: "hspOrderId", type: "bytes32" },
          { name: "txRef", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getException",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "exceptionId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "exceptionId", type: "uint256" },
          { name: "mandateId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "counterparty", type: "address" },
          { name: "category", type: "bytes32" },
          { name: "reason", type: "string" },
          { name: "createdAt", type: "uint256" },
          { name: "approvalCount", type: "uint256" },
          { name: "resolved", type: "bool" },
          { name: "approved", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getEscrow",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "escrowId", type: "uint256" },
          { name: "mandateId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "token", type: "address" },
          { name: "counterparty", type: "address" },
          { name: "ref", type: "bytes32" },
          { name: "attestationSchemaId", type: "bytes32" },
          { name: "state", type: "uint8" },
          { name: "lockedAt", type: "uint256" },
          { name: "timeout", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "isAgentBound",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "agent", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isAllowlisted",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "addr", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isDenylisted",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "addr", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },

  // ── Events ──
  {
    name: "MandateCreated",
    type: "event",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    name: "MandateFunded",
    type: "event",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "SpendDecision",
    type: "event",
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
  {
    name: "ExceptionRequested",
    type: "event",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "exceptionId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "counterparty", type: "address", indexed: false },
    ],
  },
  {
    name: "ExceptionApproved",
    type: "event",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "exceptionId", type: "uint256", indexed: true },
      { name: "approver", type: "address", indexed: false },
    ],
  },
  {
    name: "ExceptionRejected",
    type: "event",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "exceptionId", type: "uint256", indexed: true },
      { name: "rejector", type: "address", indexed: false },
    ],
  },
  {
    name: "ExceptionSpend",
    type: "event",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "exceptionId", type: "uint256", indexed: true },
      { name: "receiptId", type: "uint256", indexed: true },
    ],
  },
  {
    name: "EscrowLocked",
    type: "event",
    inputs: [
      { name: "mandateId", type: "uint256", indexed: true },
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "EscrowAttested",
    type: "event",
    inputs: [{ name: "escrowId", type: "uint256", indexed: true }],
  },
  {
    name: "EscrowReleased",
    type: "event",
    inputs: [{ name: "escrowId", type: "uint256", indexed: true }],
  },
  {
    name: "EscrowRefunded",
    type: "event",
    inputs: [{ name: "escrowId", type: "uint256", indexed: true }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const FACTORY_ABI = [
  {
    name: "mandate",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getMandateContract",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
