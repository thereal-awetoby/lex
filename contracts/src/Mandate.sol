// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMandate} from "./interfaces/IMandate.sol";
import {IERC20} from "./interfaces/IERC20.sol";

contract Mandate is IMandate {
    // ── Storage ────────────────────────────────────────────────────────
    struct MandateData {
        address owner;
        bool paused;
        Rules rules;
        address token;
        uint256 balance;
        uint256 nextReceiptId;
        uint256 nextExceptionId;
        uint256 nextEscrowId;
        uint256 lastSpendTime;
        bytes32 policyHash;
        // rolling window tracking
        uint256 rollingWindowStart;
        uint256 rollingWindowSpent;
    }

    uint256 public nextMandateId = 1;

    mapping(uint256 => MandateData) public mandates;
    mapping(uint256 => mapping(address => bool)) public boundAgents;
    mapping(uint256 => mapping(address => bool)) public allowlist;
    mapping(uint256 => mapping(address => bool)) public denylist;
    mapping(uint256 => bool) public allowlistEnabled;
    mapping(uint256 => mapping(address => uint256)) public counterpartySpent;
    mapping(uint256 => mapping(bytes32 => uint256)) public categorySpent;
    mapping(uint256 => mapping(address => uint256)) public counterpartyLastReset;
    mapping(uint256 => mapping(bytes32 => uint256)) public categoryLastReset;

    // Exception tracking
    mapping(uint256 => ExceptionRequest) public exceptions;
    mapping(uint256 => mapping(address => bool)) public approvers; // mandateId => approver => bool
    mapping(uint256 => uint256) public approverCount;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public exceptionApprovals; // mandateId => exceptionId => approver => voted

    // Receipt storage
    mapping(uint256 => Receipt) public receipts;

    // Escrow storage
    mapping(uint256 => EscrowLeg) public escrows;

    // Pending rule changes (for timelock)
    struct PendingRuleChange {
        Rules newRules;
        uint256 effectiveAt;
        bool pending;
    }
    mapping(uint256 => PendingRuleChange) public pendingRuleChanges;

    // ── Modifiers ──────────────────────────────────────────────────────
    modifier onlyOwner(uint256 mandateId) {
        require(msg.sender == mandates[mandateId].owner, "NOT_OWNER");
        _;
    }

    modifier onlyAgent(uint256 mandateId) {
        require(boundAgents[mandateId][msg.sender], "NOT_AGENT");
        _;
    }

    modifier onlyOwnerOrApprover(uint256 mandateId) {
        require(
            msg.sender == mandates[mandateId].owner || approvers[mandateId][msg.sender],
            "NOT_OWNER_OR_APPROVER"
        );
        _;
    }

    modifier notPaused(uint256 mandateId) {
        require(!mandates[mandateId].paused, "PAUSED");
        _;
    }

    // ── Create ─────────────────────────────────────────────────────────
    function createMandate(
        Rules calldata rules,
        address token,
        address[] calldata initialAgents,
        address[] calldata initialAllowlist,
        address[] calldata initialDenylist,
        address[] calldata initialApprovers
    ) external returns (uint256 mandateId) {
        mandateId = nextMandateId++;
        MandateData storage m = mandates[mandateId];
        m.owner = msg.sender;
        m.rules = rules;
        m.token = token;
        m.nextReceiptId = 1;
        m.nextExceptionId = 1;
        m.nextEscrowId = 1;
        m.rollingWindowStart = block.timestamp;
        m.policyHash = _computePolicyHash(mandateId, rules);

        for (uint256 i = 0; i < initialAgents.length; i++) {
            boundAgents[mandateId][initialAgents[i]] = true;
            emit AgentBound(mandateId, initialAgents[i]);
        }

        if (initialAllowlist.length > 0) {
            allowlistEnabled[mandateId] = true;
            for (uint256 i = 0; i < initialAllowlist.length; i++) {
                allowlist[mandateId][initialAllowlist[i]] = true;
                emit AllowlistUpdated(mandateId, initialAllowlist[i], true);
            }
        }

        for (uint256 i = 0; i < initialDenylist.length; i++) {
            denylist[mandateId][initialDenylist[i]] = true;
            emit DenylistUpdated(mandateId, initialDenylist[i], true);
        }

        for (uint256 i = 0; i < initialApprovers.length; i++) {
            approvers[mandateId][initialApprovers[i]] = true;
            approverCount[mandateId]++;
            emit ApproverAdded(mandateId, initialApprovers[i]);
        }

        emit MandateCreated(mandateId, msg.sender);
    }

    // ── Fund ───────────────────────────────────────────────────────────
    function fund(uint256 mandateId, uint256 amount) external {
        MandateData storage m = mandates[mandateId];
        require(m.owner != address(0), "NO_MANDATE");
        IERC20(m.token).transferFrom(msg.sender, address(this), amount);
        m.balance += amount;
        emit MandateFunded(mandateId, m.token, amount);
    }

    // ── Agent management ───────────────────────────────────────────────
    function bindAgent(uint256 mandateId, address agent) external onlyOwner(mandateId) {
        boundAgents[mandateId][agent] = true;
        emit AgentBound(mandateId, agent);
    }

    function revokeAgent(uint256 mandateId, address agent) external onlyOwner(mandateId) {
        boundAgents[mandateId][agent] = false;
        emit AgentRevoked(mandateId, agent);
    }

    function rotateAgent(uint256 mandateId, address oldAgent, address newAgent) external onlyOwner(mandateId) {
        boundAgents[mandateId][oldAgent] = false;
        boundAgents[mandateId][newAgent] = true;
        emit AgentRotated(mandateId, oldAgent, newAgent);
    }

    // ── Allowlist / Denylist ───────────────────────────────────────────
    function setAllowlisted(uint256 mandateId, address addr, bool allowed) external onlyOwner(mandateId) {
        if (allowed && !allowlistEnabled[mandateId]) {
            allowlistEnabled[mandateId] = true;
        }
        allowlist[mandateId][addr] = allowed;
        emit AllowlistUpdated(mandateId, addr, allowed);
    }

    function setDenylisted(uint256 mandateId, address addr, bool denied) external onlyOwner(mandateId) {
        denylist[mandateId][addr] = denied;
        emit DenylistUpdated(mandateId, addr, denied);
    }

    // ── Approver management ────────────────────────────────────────────
    function addApprover(uint256 mandateId, address approver) external onlyOwner(mandateId) {
        require(!approvers[mandateId][approver], "ALREADY_APPROVER");
        approvers[mandateId][approver] = true;
        approverCount[mandateId]++;
        emit ApproverAdded(mandateId, approver);
    }

    function removeApprover(uint256 mandateId, address approver) external onlyOwner(mandateId) {
        require(approvers[mandateId][approver], "NOT_APPROVER");
        approvers[mandateId][approver] = false;
        approverCount[mandateId]--;
        emit ApproverRemoved(mandateId, approver);
    }

    // ── Rules update (timelocked) ──────────────────────────────────────
    function proposeRules(uint256 mandateId, Rules calldata newRules) external onlyOwner(mandateId) {
        uint256 timelock = mandates[mandateId].rules.timelockForRuleChange;
        if (timelock == 0) {
            _applyRules(mandateId, newRules);
        } else {
            pendingRuleChanges[mandateId] = PendingRuleChange({
                newRules: newRules,
                effectiveAt: block.timestamp + timelock,
                pending: true
            });
        }
    }

    function executeRuleChange(uint256 mandateId) external onlyOwner(mandateId) {
        PendingRuleChange storage p = pendingRuleChanges[mandateId];
        require(p.pending, "NO_PENDING");
        require(block.timestamp >= p.effectiveAt, "TIMELOCK_ACTIVE");
        _applyRules(mandateId, p.newRules);
        p.pending = false;
    }

    function cancelRuleChange(uint256 mandateId) external onlyOwner(mandateId) {
        pendingRuleChanges[mandateId].pending = false;
    }

    function _applyRules(uint256 mandateId, Rules calldata newRules) internal {
        mandates[mandateId].rules = newRules;
        mandates[mandateId].policyHash = _computePolicyHash(mandateId, newRules);
        emit RulesUpdated(mandateId, mandates[mandateId].policyHash);
    }

    // ── Pause / Unpause ────────────────────────────────────────────────
    function pause(uint256 mandateId) external onlyOwnerOrApprover(mandateId) {
        mandates[mandateId].paused = true;
        emit MandatePaused(mandateId);
    }

    function unpause(uint256 mandateId) external onlyOwner(mandateId) {
        mandates[mandateId].paused = false;
        emit MandateUnpaused(mandateId);
    }

    // ── canSpend (view, free) ──────────────────────────────────────────
    function canSpend(
        uint256 mandateId,
        uint256 amount,
        address counterparty,
        bytes32 category
    ) external view returns (bool ok, uint16 reasonCode) {
        return _checkSpend(mandateId, amount, counterparty, category);
    }

    function _checkSpend(
        uint256 mandateId,
        uint256 amount,
        address counterparty,
        bytes32 category
    ) internal view returns (bool ok, uint16 reasonCode) {
        MandateData storage m = mandates[mandateId];

        if (m.paused) return (false, 1); // PAUSED

        if (m.rules.perTxCap > 0 && amount > m.rules.perTxCap)
            return (false, 2); // OVER_TX_CAP

        // Rolling window check
        uint256 windowDuration = m.rules.rollingWindowDuration > 0
            ? m.rules.rollingWindowDuration
            : 86400;
        uint256 currentSpent = m.rollingWindowSpent;
        if (block.timestamp >= m.rollingWindowStart + windowDuration) {
            currentSpent = 0; // window has expired
        }
        if (m.rules.rollingWindowCap > 0 && currentSpent + amount > m.rules.rollingWindowCap)
            return (false, 3); // OVER_ROLLING

        // Allowlist
        if (allowlistEnabled[mandateId] && !allowlist[mandateId][counterparty])
            return (false, 4); // NOT_ALLOWLISTED

        // Denylist
        if (denylist[mandateId][counterparty])
            return (false, 5); // DENYLISTED

        // Counterparty cap
        if (m.rules.perCounterpartyCap > 0) {
            uint256 cpSpent = counterpartySpent[mandateId][counterparty];
            uint256 cpLastReset = counterpartyLastReset[mandateId][counterparty];
            if (block.timestamp >= cpLastReset + windowDuration) {
                cpSpent = 0;
            }
            if (cpSpent + amount > m.rules.perCounterpartyCap)
                return (false, 10); // OVER_COUNTERPARTY_CAP
        }

        // Category cap
        if (m.rules.perCategoryCap > 0) {
            uint256 catSpent = categorySpent[mandateId][category];
            uint256 catLastReset = categoryLastReset[mandateId][category];
            if (block.timestamp >= catLastReset + windowDuration) {
                catSpent = 0;
            }
            if (catSpent + amount > m.rules.perCategoryCap)
                return (false, 11); // OVER_CATEGORY_CAP
        }

        // Cooldown
        if (m.rules.cooldownSeconds > 0 && m.lastSpendTime > 0) {
            if (block.timestamp < m.lastSpendTime + m.rules.cooldownSeconds)
                return (false, 7); // COOLDOWN
        }

        // Active window
        if (m.rules.activeWindowStart != 0 || m.rules.activeWindowEnd != 0) {
            uint256 timeOfDay = block.timestamp % 86400;
            if (m.rules.activeWindowStart <= m.rules.activeWindowEnd) {
                if (timeOfDay < m.rules.activeWindowStart || timeOfDay > m.rules.activeWindowEnd)
                    return (false, 8); // WINDOW_CLOSED
            } else {
                // wraps midnight
                if (timeOfDay < m.rules.activeWindowStart && timeOfDay > m.rules.activeWindowEnd)
                    return (false, 8); // WINDOW_CLOSED
            }
        }

        // Absolute ceiling
        if (m.rules.absoluteCeiling > 0 && amount > m.rules.absoluteCeiling)
            return (false, 12); // OVER_ABSOLUTE_CEILING

        // Balance
        if (amount > m.balance)
            return (false, 14); // INSUFFICIENT_FUNDS

        return (true, 0); // OK
    }

    // ── Spend (agent only) ─────────────────────────────────────────────
    function spend(
        uint256 mandateId,
        uint256 amount,
        address counterparty,
        bytes32 category,
        bytes32 ref,
        bytes32 hspOrderId
    ) external onlyAgent(mandateId) notPaused(mandateId) returns (uint256 receiptId) {
        (bool ok, uint16 reasonCode) = _checkSpend(mandateId, amount, counterparty, category);

        MandateData storage m = mandates[mandateId];
        receiptId = m.nextReceiptId++;

        if (!ok) {
            if (reasonCode == 5) {
                // Denylisted — always refuse regardless of exception mode
                _emitRefuseReceipt(mandateId, receiptId, reasonCode, amount, counterparty, category, ref);
                return receiptId;
            }
            if (m.rules.exceptionMode == ExceptionMode.GOVERNED && reasonCode != 12 && reasonCode != 14) {
                // Can request exception (but not for absolute ceiling or insufficient funds)
                _emitRefuseReceipt(mandateId, receiptId, 9, amount, counterparty, category, ref);
                return receiptId;
            }
            _emitRefuseReceipt(mandateId, receiptId, reasonCode, amount, counterparty, category, ref);
            return receiptId;
        }

        // Execute spend
        _executeSpend(mandateId, receiptId, amount, counterparty, category, ref, hspOrderId, 0);
        return receiptId;
    }

    function _executeSpend(
        uint256 mandateId,
        uint256 receiptId,
        uint256 amount,
        address counterparty,
        bytes32 category,
        bytes32 ref,
        bytes32 hspOrderId,
        uint256 exceptionId
    ) internal {
        MandateData storage m = mandates[mandateId];

        // Update rolling window
        uint256 windowDuration = m.rules.rollingWindowDuration > 0
            ? m.rules.rollingWindowDuration
            : 86400;
        if (block.timestamp >= m.rollingWindowStart + windowDuration) {
            m.rollingWindowStart = block.timestamp;
            m.rollingWindowSpent = amount;
        } else {
            m.rollingWindowSpent += amount;
        }

        // Update counterparty tracking
        if (block.timestamp >= counterpartyLastReset[mandateId][counterparty] + windowDuration) {
            counterpartyLastReset[mandateId][counterparty] = block.timestamp;
            counterpartySpent[mandateId][counterparty] = amount;
        } else {
            counterpartySpent[mandateId][counterparty] += amount;
        }

        // Update category tracking
        if (block.timestamp >= categoryLastReset[mandateId][category] + windowDuration) {
            categoryLastReset[mandateId][category] = block.timestamp;
            categorySpent[mandateId][category] = amount;
        } else {
            categorySpent[mandateId][category] += amount;
        }

        m.lastSpendTime = block.timestamp;
        m.balance -= amount;

        // Transfer tokens
        IERC20(m.token).transfer(counterparty, amount);

        Decision decision = exceptionId > 0 ? Decision.EXCEPTION : Decision.ALLOW;

        receipts[receiptId] = Receipt({
            receiptId: receiptId,
            mandateId: mandateId,
            policyHash: m.policyHash,
            decision: decision,
            reasonCode: 0,
            amount: amount,
            token: m.token,
            counterparty: counterparty,
            category: category,
            ref: ref,
            exceptionId: exceptionId,
            hspOrderId: hspOrderId,
            txRef: bytes32(0),
            timestamp: block.timestamp
        });

        emit SpendDecision(mandateId, receiptId, decision, 0, amount, counterparty, category);
        if (exceptionId > 0) {
            emit ExceptionSpend(mandateId, exceptionId, receiptId);
        }
    }

    function _emitRefuseReceipt(
        uint256 mandateId,
        uint256 receiptId,
        uint16 reasonCode,
        uint256 amount,
        address counterparty,
        bytes32 category,
        bytes32 ref
    ) internal {
        MandateData storage m = mandates[mandateId];
        receipts[receiptId] = Receipt({
            receiptId: receiptId,
            mandateId: mandateId,
            policyHash: m.policyHash,
            decision: Decision.REFUSE,
            reasonCode: reasonCode,
            amount: amount,
            token: m.token,
            counterparty: counterparty,
            category: category,
            ref: ref,
            exceptionId: 0,
            hspOrderId: bytes32(0),
            txRef: bytes32(0),
            timestamp: block.timestamp
        });
        emit SpendDecision(mandateId, receiptId, Decision.REFUSE, reasonCode, amount, counterparty, category);
    }

    // ── Exception flow ─────────────────────────────────────────────────
    function requestException(
        uint256 mandateId,
        uint256 amount,
        address counterparty,
        bytes32 category,
        string calldata reason
    ) external onlyAgent(mandateId) notPaused(mandateId) returns (uint256 exceptionId) {
        MandateData storage m = mandates[mandateId];
        require(m.rules.exceptionMode == ExceptionMode.GOVERNED, "HARD_LAW");

        // Cannot exception denylisted counterparties
        require(!denylist[mandateId][counterparty], "DENYLISTED_NO_EXCEPTION");

        // Cannot exceed absolute ceiling
        if (m.rules.absoluteCeiling > 0) {
            require(amount <= m.rules.absoluteCeiling, "OVER_ABSOLUTE_CEILING");
        }

        exceptionId = m.nextExceptionId++;
        exceptions[exceptionId] = ExceptionRequest({
            exceptionId: exceptionId,
            mandateId: mandateId,
            amount: amount,
            counterparty: counterparty,
            category: category,
            reason: reason,
            createdAt: block.timestamp,
            approvalCount: 0,
            resolved: false,
            approved: false
        });

        emit ExceptionRequested(mandateId, exceptionId, amount, counterparty);
    }

    function approveException(
        uint256 exceptionId,
        bytes32 hspOrderId
    ) external returns (uint256 receiptId) {
        ExceptionRequest storage e = exceptions[exceptionId];
        require(!e.resolved, "ALREADY_RESOLVED");
        uint256 mandateId = e.mandateId;
        MandateData storage m = mandates[mandateId];

        require(
            msg.sender == m.owner || approvers[mandateId][msg.sender],
            "NOT_AUTHORIZED"
        );
        require(!exceptionApprovals[mandateId][exceptionId][msg.sender], "ALREADY_VOTED");

        exceptionApprovals[mandateId][exceptionId][msg.sender] = true;
        e.approvalCount++;

        emit ExceptionApproved(mandateId, exceptionId, msg.sender);

        bool canExecute = false;

        // Check N-of-M threshold
        if (m.rules.exceptionApprovalThreshold > 0) {
            if (e.approvalCount >= m.rules.exceptionApprovalThreshold) {
                canExecute = true;
            }
        }

        // Check time delay (alternative path)
        if (m.rules.exceptionTimeDelay > 0 && !canExecute) {
            if (block.timestamp >= e.createdAt + m.rules.exceptionTimeDelay && e.approvalCount > 0) {
                canExecute = true;
            }
        }

        // If neither is configured, owner approval alone suffices
        if (m.rules.exceptionApprovalThreshold == 0 && m.rules.exceptionTimeDelay == 0) {
            if (msg.sender == m.owner) {
                canExecute = true;
            }
        }

        if (canExecute) {
            e.resolved = true;
            e.approved = true;
            receiptId = m.nextReceiptId++;
            _executeSpend(mandateId, receiptId, e.amount, e.counterparty, e.category, bytes32(0), hspOrderId, exceptionId);
        }
    }

    function rejectException(uint256 exceptionId) external {
        ExceptionRequest storage e = exceptions[exceptionId];
        require(!e.resolved, "ALREADY_RESOLVED");
        uint256 mandateId = e.mandateId;
        MandateData storage m = mandates[mandateId];

        require(
            msg.sender == m.owner || approvers[mandateId][msg.sender],
            "NOT_AUTHORIZED"
        );

        e.resolved = true;
        e.approved = false;
        emit ExceptionRejected(mandateId, exceptionId, msg.sender);
    }

    // ── Escrow ─────────────────────────────────────────────────────────
    function payWithEscrow(
        uint256 mandateId,
        address counterparty,
        uint256 amount,
        bytes32 attestationSchemaId,
        bytes32 ref,
        uint256 timeout
    ) external onlyAgent(mandateId) notPaused(mandateId) returns (uint256 escrowId) {
        (bool ok, uint16 reasonCode) = _checkSpend(mandateId, amount, counterparty, bytes32("escrow"));
        require(ok, string(abi.encodePacked("SPEND_CHECK_FAILED:", reasonCode)));

        MandateData storage m = mandates[mandateId];
        escrowId = m.nextEscrowId++;
        m.balance -= amount;

        escrows[escrowId] = EscrowLeg({
            escrowId: escrowId,
            mandateId: mandateId,
            amount: amount,
            token: m.token,
            counterparty: counterparty,
            ref: ref,
            attestationSchemaId: attestationSchemaId,
            state: EscrowState.LOCKED,
            lockedAt: block.timestamp,
            timeout: timeout
        });

        // Update tracking same as spend
        uint256 windowDuration = m.rules.rollingWindowDuration > 0
            ? m.rules.rollingWindowDuration
            : 86400;
        if (block.timestamp >= m.rollingWindowStart + windowDuration) {
            m.rollingWindowStart = block.timestamp;
            m.rollingWindowSpent = amount;
        } else {
            m.rollingWindowSpent += amount;
        }
        m.lastSpendTime = block.timestamp;

        emit EscrowLocked(mandateId, escrowId, amount);
    }

    function attestEscrow(uint256 escrowId) external {
        EscrowLeg storage e = escrows[escrowId];
        require(e.state == EscrowState.LOCKED, "NOT_LOCKED");
        // Counterparty or owner can attest
        require(
            msg.sender == e.counterparty || msg.sender == mandates[e.mandateId].owner,
            "NOT_AUTHORIZED"
        );
        e.state = EscrowState.ATTESTED;
        emit EscrowAttested(escrowId);
    }

    function releaseEscrow(uint256 escrowId) external {
        EscrowLeg storage e = escrows[escrowId];
        require(e.state == EscrowState.ATTESTED, "NOT_ATTESTED");
        MandateData storage m = mandates[e.mandateId];
        require(
            msg.sender == m.owner || msg.sender == e.counterparty || boundAgents[e.mandateId][msg.sender],
            "NOT_AUTHORIZED"
        );

        e.state = EscrowState.RELEASED;
        IERC20(e.token).transfer(e.counterparty, e.amount);
        emit EscrowReleased(escrowId);
    }

    function refundEscrow(uint256 escrowId) external {
        EscrowLeg storage e = escrows[escrowId];
        require(e.state == EscrowState.LOCKED, "NOT_LOCKED");
        MandateData storage m = mandates[e.mandateId];

        bool timedOut = e.timeout > 0 && block.timestamp >= e.lockedAt + e.timeout;
        bool isOwner = msg.sender == m.owner;
        require(timedOut || isOwner, "NOT_REFUNDABLE");

        e.state = EscrowState.REFUNDED;
        m.balance += e.amount;
        emit EscrowRefunded(escrowId);
    }

    // ── Owner withdraw ─────────────────────────────────────────────────
    function withdraw(uint256 mandateId, uint256 amount) external onlyOwner(mandateId) {
        MandateData storage m = mandates[mandateId];
        require(amount <= m.balance, "INSUFFICIENT");
        m.balance -= amount;
        IERC20(m.token).transfer(msg.sender, amount);
        emit OwnerWithdraw(mandateId, amount);
    }

    // ── Getters ────────────────────────────────────────────────────────
    function getMandate(uint256 mandateId) external view returns (
        address owner,
        bool paused,
        address token,
        uint256 balance,
        bytes32 policyHash,
        Rules memory rules
    ) {
        MandateData storage m = mandates[mandateId];
        return (m.owner, m.paused, m.token, m.balance, m.policyHash, m.rules);
    }

    function getReceipt(uint256 receiptId) external view returns (Receipt memory) {
        return receipts[receiptId];
    }

    function getException(uint256 exceptionId) external view returns (ExceptionRequest memory) {
        return exceptions[exceptionId];
    }

    function getEscrow(uint256 escrowId) external view returns (EscrowLeg memory) {
        return escrows[escrowId];
    }

    function isAgentBound(uint256 mandateId, address agent) external view returns (bool) {
        return boundAgents[mandateId][agent];
    }

    function isAllowlisted(uint256 mandateId, address addr) external view returns (bool) {
        if (!allowlistEnabled[mandateId]) return true;
        return allowlist[mandateId][addr];
    }

    function isDenylisted(uint256 mandateId, address addr) external view returns (bool) {
        return denylist[mandateId][addr];
    }

    // ── Internal ───────────────────────────────────────────────────────
    function _computePolicyHash(uint256 mandateId, Rules memory rules) internal pure returns (bytes32) {
        return keccak256(abi.encode(mandateId, rules));
    }
}
