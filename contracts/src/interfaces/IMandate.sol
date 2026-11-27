// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMandate {
    // ── Enums ──────────────────────────────────────────────────────────
    enum ExceptionMode { HARD_LAW, GOVERNED }
    enum Decision { ALLOW, REFUSE, EXCEPTION }
    enum SettlementRail { HSP, DIRECT, HSP_THEN_DIRECT }
    enum EscrowState { LOCKED, ATTESTED, RELEASED, REFUNDED }

    // ── Structs ────────────────────────────────────────────────────────
    struct Rules {
        uint256 perTxCap;
        uint256 rollingWindowCap;      // 24h rolling
        uint256 rollingWindowDuration;  // seconds (default 86400)
        uint256 perCounterpartyCap;
        uint256 perCategoryCap;
        uint256 cooldownSeconds;        // min gap between pays
        uint256 activeWindowStart;      // seconds from midnight UTC
        uint256 activeWindowEnd;        // seconds from midnight UTC (0,0 = always)
        uint256 minCounterpartyTier;
        uint256 absoluteCeiling;        // hard ceiling even for exceptions
        ExceptionMode exceptionMode;
        SettlementRail preferredRail;
        uint8 exceptionApprovalThreshold; // N of M
        uint256 exceptionTimeDelay;       // seconds (alternative to N-of-M)
        uint256 timelockForRuleChange;    // seconds before rule change takes effect
    }

    struct SpendProposal {
        uint256 mandateId;
        uint256 amount;
        address counterparty;
        bytes32 category;
        bytes32 ref; // invoice/order id hash
        bytes metadata;
    }

    struct Receipt {
        uint256 receiptId;
        uint256 mandateId;
        bytes32 policyHash;
        Decision decision;
        uint16 reasonCode;
        uint256 amount;
        address token;
        address counterparty;
        bytes32 category;
        bytes32 ref;
        uint256 exceptionId;
        bytes32 hspOrderId;
        bytes32 txRef;
        uint256 timestamp;
        address agent;
    }

    struct ExceptionRequest {
        uint256 exceptionId;
        uint256 mandateId;
        uint256 amount;
        address counterparty;
        bytes32 category;
        string reason;
        uint256 createdAt;
        uint256 approvalCount;
        bool resolved;
        bool approved;
        address agent;
    }

    struct EscrowLeg {
        uint256 escrowId;
        uint256 mandateId;
        uint256 amount;
        address token;
        address counterparty;
        bytes32 ref;
        bytes32 attestationSchemaId;
        EscrowState state;
        uint256 lockedAt;
        uint256 timeout;
    }

    struct SpendIntent {
        uint256 mandateId;
        uint256 amount;
        address counterparty;
        bytes32 category;
        bytes32 ref;
        bytes32 hspOrderId;
        uint256 nonce;
        uint256 deadline;
    }

    // ── Reason codes ───────────────────────────────────────────────────
    // 0 = OK
    // 1 = PAUSED
    // 2 = OVER_TX_CAP
    // 3 = OVER_ROLLING
    // 4 = NOT_ALLOWLISTED
    // 5 = DENYLISTED
    // 6 = TIER_TOO_LOW
    // 7 = COOLDOWN
    // 8 = WINDOW_CLOSED
    // 9 = EXCEPTION_REQUIRED
    // 10 = OVER_COUNTERPARTY_CAP
    // 11 = OVER_CATEGORY_CAP
    // 12 = OVER_ABSOLUTE_CEILING
    // 13 = AGENT_NOT_BOUND
    // 14 = INSUFFICIENT_FUNDS

    // ── Events ─────────────────────────────────────────────────────────
    event MandateCreated(uint256 indexed mandateId, address indexed owner);
    event MandateFunded(uint256 indexed mandateId, address token, uint256 amount);
    event AgentBound(uint256 indexed mandateId, address indexed agent);
    event AgentRevoked(uint256 indexed mandateId, address indexed agent);
    event AgentRotated(uint256 indexed mandateId, address indexed oldAgent, address indexed newAgent);
    event RulesUpdated(uint256 indexed mandateId, bytes32 newPolicyHash);
    event SpendDecision(
        uint256 indexed mandateId,
        uint256 indexed receiptId,
        Decision decision,
        uint16 reasonCode,
        uint256 amount,
        address counterparty,
        bytes32 category
    );
    event ExceptionRequested(uint256 indexed mandateId, uint256 indexed exceptionId, uint256 amount, address counterparty);
    event ExceptionApproved(uint256 indexed mandateId, uint256 indexed exceptionId, address approver);
    event ExceptionRejected(uint256 indexed mandateId, uint256 indexed exceptionId, address rejector);
    event ExceptionSpend(uint256 indexed mandateId, uint256 indexed exceptionId, uint256 indexed receiptId);
    event MandatePaused(uint256 indexed mandateId);
    event MandateUnpaused(uint256 indexed mandateId);
    event OwnerWithdraw(uint256 indexed mandateId, uint256 amount);
    event EscrowLocked(uint256 indexed mandateId, uint256 indexed escrowId, uint256 amount);
    event EscrowAttested(uint256 indexed escrowId);
    event EscrowReleased(uint256 indexed escrowId);
    event EscrowRefunded(uint256 indexed escrowId);
    event AllowlistUpdated(uint256 indexed mandateId, address addr, bool allowed);
    event DenylistUpdated(uint256 indexed mandateId, address addr, bool denied);
    event ApproverAdded(uint256 indexed mandateId, address approver);
    event ApproverRemoved(uint256 indexed mandateId, address approver);
    event CounterpartyTierSet(uint256 indexed mandateId, address indexed counterparty, uint256 tier);

    event RuleChangeQueued(uint256 indexed mandateId, bytes32 newPolicyHash, uint256 effectiveAt);
    event RuleChangeCancelled(uint256 indexed mandateId);
    event AgentCapSet(uint256 indexed mandateId, address indexed agent, uint256 cap);
    event GuardianSet(uint256 indexed mandateId, address indexed guardian);
    event EnvelopeSet(uint256 indexed mandateId, bytes32 indexed category, uint256 budget);
    event HeartbeatPolicySet(uint256 indexed mandateId, uint256 maxSilenceSeconds);
    event AgentHeartbeat(uint256 indexed mandateId, address indexed agent);
    event SpendIntentExecuted(uint256 indexed mandateId, address indexed agent, bytes32 digest, uint256 receiptId, address relayer);

    // ── View ───────────────────────────────────────────────────────────
    function canSpend(
        uint256 mandateId,
        uint256 amount,
        address counterparty,
        bytes32 category
    ) external view returns (bool ok, uint16 reasonCode);
}
