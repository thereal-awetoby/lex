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
    name: "cancelRuleChange",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "mandateId", type: "uint256" }],
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

  {
    name: "executeException",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exceptionId", type: "uint256" },
      { name: "hspOrderId", type: "bytes32" },
    ],
    outputs: [{ name: "receiptId", type: "uint256" }],
  },
  {
    name: "approvers",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "approver", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "nextReceiptId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nextExceptionId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nextEscrowId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nextMandateId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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

  {
    name: "setCounterpartyTier",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "tier", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "counterpartyTier",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "counterparty", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
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
          { name: "agent", type: "address" },
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
          { name: "agent", type: "address" },
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
  {
    "type": "function",
    "name": "SPEND_INTENT_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canAgentSpend",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "cp",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "category",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canExecuteIntent",
    "inputs": [
      {
        "name": "intent",
        "type": "tuple",
        "internalType": "struct IMandate.SpendIntent",
        "components": [
          {
            "name": "mandateId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "counterparty",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "category",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "ref",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "hspOrderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "sig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "ok",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "reasonCode",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canSpendBatch",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amounts",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "cps",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "cats",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "outputs": [
      {
        "name": "ok",
        "type": "bool[]",
        "internalType": "bool[]"
      },
      {
        "name": "reasons",
        "type": "uint16[]",
        "internalType": "uint16[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "domainSeparator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "envelopeRemaining",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "category",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeSpendIntent",
    "inputs": [
      {
        "name": "intent",
        "type": "tuple",
        "internalType": "struct IMandate.SpendIntent",
        "components": [
          {
            "name": "mandateId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "counterparty",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "category",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "ref",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "hspOrderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "sig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAgentCap",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "spentInWindow",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEnvelope",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "category",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "budget",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "spent",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPendingRuleChange",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "pending",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "effectiveAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "newRules",
        "type": "tuple",
        "internalType": "struct IMandate.Rules",
        "components": [
          {
            "name": "perTxCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "rollingWindowCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "rollingWindowDuration",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "perCounterpartyCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "perCategoryCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "cooldownSeconds",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "activeWindowStart",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "activeWindowEnd",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minCounterpartyTier",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "absoluteCeiling",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "exceptionMode",
            "type": "uint8",
            "internalType": "enum IMandate.ExceptionMode"
          },
          {
            "name": "preferredRail",
            "type": "uint8",
            "internalType": "enum IMandate.SettlementRail"
          },
          {
            "name": "exceptionApprovalThreshold",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "exceptionTimeDelay",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "timelockForRuleChange",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "guardian",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashSpendIntent",
    "inputs": [
      {
        "name": "intent",
        "type": "tuple",
        "internalType": "struct IMandate.SpendIntent",
        "components": [
          {
            "name": "mandateId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "counterparty",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "category",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "ref",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "hspOrderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "heartbeat",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "heartbeatMaxSilence",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "intentNonces",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastHeartbeat",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reasonCodeString",
    "inputs": [
      {
        "name": "code",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "setAgentCap",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setEnvelope",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "category",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "budget",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setGuardian",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "newGuardian",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setHeartbeatPolicy",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "seconds_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usedIntents",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AgentCapSet",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "cap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AgentHeartbeat",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CounterpartyTierSet",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "counterparty",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tier",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EnvelopeSet",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "category",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "budget",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GuardianSet",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "guardian",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HeartbeatPolicySet",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "maxSilenceSeconds",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RuleChangeCancelled",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RuleChangeQueued",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "newPolicyHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "effectiveAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SpendIntentExecuted",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "digest",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "receiptId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "relayer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
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
