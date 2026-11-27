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
        uint256 lastSpendTime;
        bytes32 policyHash;
        // rolling window tracking
        uint256 rollingWindowStart;
        uint256 rollingWindowSpent;
    }

    uint256 public nextMandateId = 1;
    // IDs are global so receipts, exceptions and escrows never collide across mandates
    uint256 public nextReceiptId = 1;
    uint256 public nextExceptionId = 1;
    uint256 public nextEscrowId = 1;

    mapping(uint256 => MandateData) internal mandates;
    mapping(uint256 => mapping(address => bool)) internal boundAgents;
    mapping(uint256 => mapping(address => bool)) internal allowlist;
    mapping(uint256 => mapping(address => bool)) internal denylist;
    mapping(uint256 => bool) internal allowlistEnabled;
    mapping(uint256 => mapping(address => uint256)) public counterpartyTier; // mandateId => counterparty => tier
    mapping(uint256 => mapping(address => uint256)) internal counterpartySpent;
    mapping(uint256 => mapping(bytes32 => uint256)) internal categorySpent;
    mapping(uint256 => mapping(address => uint256)) internal counterpartyLastReset;
    mapping(uint256 => mapping(bytes32 => uint256)) internal categoryLastReset;

    // Exception tracking
    mapping(uint256 => ExceptionRequest) internal exceptions;
    mapping(uint256 => mapping(address => bool)) public approvers; // mandateId => approver => bool
    mapping(uint256 => uint256) internal approverCount;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) internal exceptionApprovals; // mandateId => exceptionId => approver => voted

    // Receipt storage
    mapping(uint256 => Receipt) internal receipts;

    // Escrow storage
    mapping(uint256 => EscrowLeg) internal escrows;

    // Pending rule changes (for timelock)
    struct PendingRuleChange {
        Rules newRules;
        uint256 effectiveAt;
        bool pending;
    }
    mapping(uint256 => PendingRuleChange) internal pendingRuleChanges;

    mapping(uint256 => mapping(address => uint256)) internal agentCap;
    mapping(uint256 => mapping(address => uint256)) internal agentSpent;
    mapping(uint256 => mapping(address => uint256)) internal agentLastReset;
    mapping(uint256 => mapping(bytes32 => uint256)) internal envelopeBudget;
    mapping(uint256 => mapping(bytes32 => uint256)) internal envelopeSpent;
    mapping(uint256 => uint256) public heartbeatMaxSilence;
    mapping(uint256 => mapping(address => uint256)) public lastHeartbeat;
    mapping(uint256 => address) public guardian;
    bytes32 public constant SPEND_INTENT_TYPEHASH = keccak256("SpendIntent(uint256 mandateId,uint256 amount,address counterparty,bytes32 category,bytes32 ref,bytes32 hspOrderId,uint256 nonce,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    mapping(address => uint256) public intentNonces;
    mapping(bytes32 => bool) public usedIntents;

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
        _safeTransferFrom(m.token, msg.sender, address(this), amount);
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
        require(boundAgents[mandateId][oldAgent], "NOT_AGENT");
        require(!boundAgents[mandateId][newAgent], "ALREADY_BOUND");
        boundAgents[mandateId][oldAgent] = false;
        boundAgents[mandateId][newAgent] = true;
        agentCap[mandateId][newAgent] = agentCap[mandateId][oldAgent];
        agentSpent[mandateId][newAgent] = agentSpent[mandateId][oldAgent];
        agentLastReset[mandateId][newAgent] = agentLastReset[mandateId][oldAgent];
        delete agentCap[mandateId][oldAgent];
        delete agentSpent[mandateId][oldAgent];
        delete agentLastReset[mandateId][oldAgent];
        delete lastHeartbeat[mandateId][newAgent];
        emit AgentRotated(mandateId, oldAgent, newAgent);
    }

    function setAgentCap(uint256 id, address agent, uint256 cap) external onlyOwner(id) {
        agentCap[id][agent] = cap; emit AgentCapSet(id, agent, cap);
    }
    function heartbeat(uint256 id) external onlyAgent(id) {
        lastHeartbeat[id][msg.sender] = block.timestamp; emit AgentHeartbeat(id, msg.sender);
    }
    function setHeartbeatPolicy(uint256 id, uint256 seconds_) external onlyOwner(id) {
        heartbeatMaxSilence[id] = seconds_; emit HeartbeatPolicySet(id, seconds_);
    }
    function setGuardian(uint256 id, address newGuardian) external onlyOwner(id) {
        guardian[id] = newGuardian; emit GuardianSet(id, newGuardian);
    }
    function setEnvelope(uint256 id, bytes32 category, uint256 budget) external onlyOwner(id) {
        envelopeBudget[id][category] = budget;
        if (budget == 0) envelopeSpent[id][category] = 0;
        emit EnvelopeSet(id, category, budget);
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

    /// @notice Owner-assigned trust tier for a counterparty. Spends need tier >= rules.minCounterpartyTier.
    function setCounterpartyTier(uint256 mandateId, address counterparty, uint256 tier) external onlyOwner(mandateId) {
        counterpartyTier[mandateId][counterparty] = tier;
        emit CounterpartyTierSet(mandateId, counterparty, tier);
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
            emit RuleChangeQueued(mandateId, _computePolicyHash(mandateId, newRules), block.timestamp + timelock);
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
        require(pendingRuleChanges[mandateId].pending, "NO_PENDING");
        pendingRuleChanges[mandateId].pending = false;
        emit RuleChangeCancelled(mandateId);
    }

    function _applyRules(uint256 mandateId, Rules memory newRules) internal {
        mandates[mandateId].rules = newRules;
        mandates[mandateId].policyHash = _computePolicyHash(mandateId, newRules);
        emit RulesUpdated(mandateId, mandates[mandateId].policyHash);
    }

    // ── Pause / Unpause ────────────────────────────────────────────────
    function pause(uint256 mandateId) external {
        require(msg.sender == mandates[mandateId].owner || approvers[mandateId][msg.sender] || msg.sender == guardian[mandateId], "NOT_AUTHORIZED");
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

        // Denylist is checked before everything else so the reason is never masked
        if (denylist[mandateId][counterparty])
            return (false, 5); // DENYLISTED

        // A payment above the ceiling cannot be made via an exception.
        if (m.rules.absoluteCeiling > 0 && amount > m.rules.absoluteCeiling)
            return (false, 12); // OVER_ABSOLUTE_CEILING

        uint256 budget = envelopeBudget[mandateId][category];
        if (budget > 0 && envelopeSpent[mandateId][category] + amount > budget) return (false, 16);

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

        // Counterparty tier
        if (m.rules.minCounterpartyTier > 0 && counterpartyTier[mandateId][counterparty] < m.rules.minCounterpartyTier)
            return (false, 6); // TIER_TOO_LOW

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

        // Balance
        if (amount > m.balance)
            return (false, 14); // INSUFFICIENT_FUNDS

        return (true, 0); // OK
    }

    function _agentCheck(uint256 id, address agent, uint256 amount) internal view returns (uint16) {
        uint256 maxSilence = heartbeatMaxSilence[id];
        if (maxSilence > 0 && (lastHeartbeat[id][agent] == 0 || block.timestamp > lastHeartbeat[id][agent] + maxSilence)) return 17;
        uint256 cap = agentCap[id][agent];
        if (cap > 0 && _agentSpentInWindow(id, agent) + amount > cap) return 15;
        return 0;
    }
    function _agentSpentInWindow(uint256 id, address agent) internal view returns (uint256) {
        uint256 window = mandates[id].rules.rollingWindowDuration;
        if (window == 0) window = 86400;
        return block.timestamp >= agentLastReset[id][agent] + window ? 0 : agentSpent[id][agent];
    }
    function _checkAgentSpend(uint256 id, address agent, uint256 amount, address cp, bytes32 category) internal view returns (bool, uint16) {
        (bool ok, uint16 reason) = _checkSpend(id, amount, cp, category);
        if (!ok && (reason == 1 || reason == 5 || reason == 12 || reason == 16)) return (false, reason);
        uint16 agentReason = _agentCheck(id, agent, amount);
        if (agentReason != 0) return (false, agentReason);
        return (ok, reason);
    }
    function canAgentSpend(uint256 id, address agent, uint256 amount, address cp, bytes32 category) external view returns (bool, uint16) {
        if (!boundAgents[id][agent]) return (false, 13);
        return _checkAgentSpend(id, agent, amount, cp, category);
    }
    function canSpendBatch(uint256 id, uint256[] calldata amounts, address[] calldata cps, bytes32[] calldata cats) external view returns (bool[] memory ok, uint16[] memory reasons) {
        uint256 n = amounts.length; require(cps.length == n && cats.length == n, "LENGTH_MISMATCH");
        ok = new bool[](n); reasons = new uint16[](n);
        for (uint256 i; i < n; i++) (ok[i], reasons[i]) = _checkSpend(id, amounts[i], cps[i], cats[i]);
    }

    // ── Spend (agent only) ─────────────────────────────────────────────
    function spend(
        uint256 mandateId,
        uint256 amount,
        address counterparty,
        bytes32 category,
        bytes32 ref,
        bytes32 hspOrderId
    ) external onlyAgent(mandateId) returns (uint256 receiptId) {
        return _decide(mandateId, msg.sender, amount, counterparty, category, ref, hspOrderId);
    }

    function _decide(uint256 mandateId, address agent, uint256 amount, address counterparty, bytes32 category, bytes32 ref, bytes32 hspOrderId) internal returns (uint256 receiptId) {
        (bool ok, uint16 reasonCode) = _checkAgentSpend(mandateId, agent, amount, counterparty, category);

        MandateData storage m = mandates[mandateId];
        receiptId = nextReceiptId++;

        if (!ok) {
            // Paused, denylisted, over absolute ceiling and insufficient funds are never exceptionable
            bool exceptionable = reasonCode == 2 || reasonCode == 3 || reasonCode == 4 || reasonCode == 6 || reasonCode == 7 || reasonCode == 8 || reasonCode == 10 || reasonCode == 11;
            if (m.rules.exceptionMode == ExceptionMode.GOVERNED && exceptionable) {
                _emitRefuseReceipt(mandateId, receiptId, 9, amount, counterparty, category, ref);
                receipts[receiptId].agent = agent;
                return receiptId;
            }
            _emitRefuseReceipt(mandateId, receiptId, reasonCode, amount, counterparty, category, ref);
            receipts[receiptId].agent = agent;
            return receiptId;
        }

        // Execute spend
        _executeSpend(mandateId, agent, receiptId, amount, counterparty, category, ref, hspOrderId, 0);
        return receiptId;
    }

    function _executeSpend(
        uint256 mandateId,
        address agent,
        uint256 receiptId,
        uint256 amount,
        address counterparty,
        bytes32 category,
        bytes32 ref,
        bytes32 hspOrderId,
        uint256 exceptionId
    ) internal {
        MandateData storage m = mandates[mandateId];

        _trackSpend(mandateId, agent, amount, counterparty, category);
        m.balance -= amount;

        Decision decision = exceptionId > 0 ? Decision.EXCEPTION : Decision.ALLOW;
        _writeReceipt(mandateId, receiptId, decision, 0, amount, counterparty, category, ref, exceptionId, hspOrderId, bytes32(0));

        receipts[receiptId].agent = agent;
        // Effects are done; interaction last
        _safeTransfer(m.token, counterparty, amount);

        emit SpendDecision(mandateId, receiptId, decision, 0, amount, counterparty, category);
        if (exceptionId > 0) {
            emit ExceptionSpend(mandateId, exceptionId, receiptId);
        }
    }

    /// @dev Updates rolling, counterparty, category and cooldown tracking. Used by spend and escrow.
    function _trackSpend(uint256 mandateId, address agent, uint256 amount, address counterparty, bytes32 category) internal {
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

        if (block.timestamp >= agentLastReset[mandateId][agent] + windowDuration) {
            agentLastReset[mandateId][agent] = block.timestamp;
            agentSpent[mandateId][agent] = amount;
        } else agentSpent[mandateId][agent] += amount;
        if (envelopeBudget[mandateId][category] > 0) envelopeSpent[mandateId][category] += amount;
        m.lastSpendTime = block.timestamp;
    }

    function _writeReceipt(
        uint256 mandateId,
        uint256 receiptId,
        Decision decision,
        uint16 reasonCode,
        uint256 amount,
        address counterparty,
        bytes32 category,
        bytes32 ref,
        uint256 exceptionId,
        bytes32 hspOrderId,
        bytes32 txRef
    ) internal {
        MandateData storage m = mandates[mandateId];
        Receipt storage r = receipts[receiptId];
        r.receiptId = receiptId;
        r.mandateId = mandateId;
        r.policyHash = m.policyHash;
        r.decision = decision;
        r.reasonCode = reasonCode;
        r.amount = amount;
        r.token = m.token;
        r.counterparty = counterparty;
        r.category = category;
        r.ref = ref;
        r.exceptionId = exceptionId;
        r.hspOrderId = hspOrderId;
        r.txRef = txRef;
        r.timestamp = block.timestamp;
    }

    /// @dev Handles tokens that return no bool (USDT-style) and reverts on failure.
    function _safeTransfer(address token, address to, uint256 amount) internal {
        require(token.code.length > 0, "NOT_A_TOKEN");
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        require(token.code.length > 0, "NOT_A_TOKEN");
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
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
        _writeReceipt(mandateId, receiptId, Decision.REFUSE, reasonCode, amount, counterparty, category, ref, 0, bytes32(0), bytes32(0));
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

        _requireOverridable(mandateId, msg.sender, amount, counterparty, category);
        exceptionId = nextExceptionId++;
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
            approved: false,
            agent: msg.sender
        });

        emit ExceptionRequested(mandateId, exceptionId, amount, counterparty);
    }

    function _requireOverridable(uint256 id, address agent, uint256 amount, address cp, bytes32 category) internal view {
        require(!denylist[id][cp], "DENYLISTED_NO_EXCEPTION");
        uint256 ceiling = mandates[id].rules.absoluteCeiling;
        require(ceiling == 0 || amount <= ceiling, "OVER_ABSOLUTE_CEILING");
        uint256 budget = envelopeBudget[id][category];
        require(budget == 0 || envelopeSpent[id][category] + amount <= budget, "ENVELOPE_EXCEEDED");
        uint16 code = _agentCheck(id, agent, amount);
        require(code != 17, "AGENT_HEARTBEAT_STALE");
        require(code != 15, "OVER_AGENT_CAP");
    }

    function approveException(
        uint256 exceptionId,
        bytes32 hspOrderId
    ) external returns (uint256 receiptId) {
        ExceptionRequest storage e = exceptions[exceptionId];
        require(!e.resolved, "ALREADY_RESOLVED");
        require(e.mandateId != 0, "NO_EXCEPTION");
        uint256 mandateId = e.mandateId;
        MandateData storage m = mandates[mandateId];
        require(!m.paused, "PAUSED");

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
            receiptId = _resolveAndExecute(exceptionId, hspOrderId);
        }
    }

    /// @notice Executes an approved exception once its time delay has passed.
    ///         Needed when the only approval was cast before the delay elapsed.
    function executeException(uint256 exceptionId, bytes32 hspOrderId) external returns (uint256 receiptId) {
        ExceptionRequest storage e = exceptions[exceptionId];
        require(e.mandateId != 0, "NO_EXCEPTION");
        require(!e.resolved, "ALREADY_RESOLVED");
        MandateData storage m = mandates[e.mandateId];
        require(!m.paused, "PAUSED");
        require(
            msg.sender == m.owner || approvers[e.mandateId][msg.sender] || boundAgents[e.mandateId][msg.sender],
            "NOT_AUTHORIZED"
        );
        require(m.rules.exceptionTimeDelay > 0, "NO_TIME_DELAY");
        require(e.approvalCount > 0, "NO_APPROVALS");
        require(block.timestamp >= e.createdAt + m.rules.exceptionTimeDelay, "DELAY_NOT_PASSED");
        receiptId = _resolveAndExecute(exceptionId, hspOrderId);
    }

    function _resolveAndExecute(uint256 exceptionId, bytes32 hspOrderId) internal returns (uint256 receiptId) {
        ExceptionRequest storage e = exceptions[exceptionId];
        MandateData storage m = mandates[e.mandateId];
        // Re-check the limits no exception can override, in case state changed since the request
        require(!denylist[e.mandateId][e.counterparty], "DENYLISTED_NO_EXCEPTION");
        if (m.rules.absoluteCeiling > 0) {
            require(e.amount <= m.rules.absoluteCeiling, "OVER_ABSOLUTE_CEILING");
        }
        require(boundAgents[e.mandateId][e.agent], "AGENT_NOT_BOUND");
        _requireOverridable(e.mandateId, e.agent, e.amount, e.counterparty, e.category);
        require(e.amount <= m.balance, "INSUFFICIENT_FUNDS");

        e.resolved = true;
        e.approved = true;
        receiptId = nextReceiptId++;
        _executeSpend(e.mandateId, e.agent, receiptId, e.amount, e.counterparty, e.category, bytes32(0), hspOrderId, exceptionId);
    }

    function rejectException(uint256 exceptionId) external {
        ExceptionRequest storage e = exceptions[exceptionId];
        require(e.mandateId != 0, "NO_EXCEPTION");
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
    ) external onlyAgent(mandateId) returns (uint256 escrowId) {
        require(timeout > 0, "TIMEOUT_REQUIRED");
        bytes32 category = bytes32("escrow");
        // Refusals, including pause, write a receipt and lock nothing.
        (bool ok, uint16 reasonCode) = _checkAgentSpend(mandateId, msg.sender, amount, counterparty, category);
        if (!ok) {
            uint256 refusedReceipt = nextReceiptId++;
            _emitRefuseReceipt(mandateId, refusedReceipt, reasonCode, amount, counterparty, category, ref);
            receipts[refusedReceipt].agent = msg.sender;
            return 0;
        }

        MandateData storage m = mandates[mandateId];
        escrowId = nextEscrowId++;

        // Escrow counts against every limit exactly like a direct spend
        _trackSpend(mandateId, msg.sender, amount, counterparty, category);
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

        // The lock is the spend decision, so it gets a receipt. txRef carries the escrow id.
        uint256 receiptId = nextReceiptId++;
        _writeReceipt(
            mandateId, receiptId, Decision.ALLOW, 0, amount, counterparty, category, ref, 0, bytes32(0), bytes32(escrowId)
        );
        receipts[receiptId].agent = msg.sender;
        emit SpendDecision(mandateId, receiptId, Decision.ALLOW, 0, amount, counterparty, category);
        emit EscrowLocked(mandateId, escrowId, amount);
    }

    /// @notice Payer side (owner or bound agent) confirms delivery. The counterparty cannot attest for itself.
    function attestEscrow(uint256 escrowId) external {
        EscrowLeg storage e = escrows[escrowId];
        require(e.state == EscrowState.LOCKED, "NOT_LOCKED");
        require(
            msg.sender == mandates[e.mandateId].owner || boundAgents[e.mandateId][msg.sender],
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
        _safeTransfer(e.token, e.counterparty, e.amount);
        emit EscrowReleased(escrowId);
    }

    /// @notice After the timeout, an unattested escrow returns to the mandate balance.
    ///         Anyone can trigger it; funds can only go back to the mandate.
    ///         Before the timeout the counterparty has a guarantee the funds stay locked.
    function refundEscrow(uint256 escrowId) external {
        EscrowLeg storage e = escrows[escrowId];
        require(e.state == EscrowState.LOCKED, "NOT_LOCKED");
        require(block.timestamp >= e.lockedAt + e.timeout, "NOT_REFUNDABLE");

        e.state = EscrowState.REFUNDED;
        mandates[e.mandateId].balance += e.amount;
        emit EscrowRefunded(escrowId);
    }

    // ── Owner withdraw ─────────────────────────────────────────────────
    function withdraw(uint256 mandateId, uint256 amount) external onlyOwner(mandateId) {
        MandateData storage m = mandates[mandateId];
        require(amount <= m.balance, "INSUFFICIENT");
        m.balance -= amount;
        _safeTransfer(m.token, msg.sender, amount);
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

    function getPendingRuleChange(uint256 id) external view returns (bool pending, uint256 effectiveAt, Rules memory newRules) {
        PendingRuleChange storage p = pendingRuleChanges[id]; return (p.pending, p.effectiveAt, p.newRules);
    }
    function getAgentCap(uint256 id, address agent) external view returns (uint256 cap, uint256 spentInWindow) {
        return (agentCap[id][agent], _agentSpentInWindow(id, agent));
    }
    function getEnvelope(uint256 id, bytes32 category) external view returns (uint256 budget, uint256 spent) {
        return (envelopeBudget[id][category], envelopeSpent[id][category]);
    }
    function envelopeRemaining(uint256 id, bytes32 category) external view returns (uint256) {
        uint256 budget = envelopeBudget[id][category]; uint256 spent = envelopeSpent[id][category];
        return budget == 0 ? type(uint256).max : spent >= budget ? 0 : budget - spent;
    }
    function reasonCodeString(uint16 code) external pure returns (string memory) {
        if (code == 0) return "OK";
        if (code == 1) return "PAUSED";
        if (code == 2) return "OVER_TX_CAP";
        if (code == 3) return "OVER_ROLLING";
        if (code == 4) return "NOT_ALLOWLISTED";
        if (code == 5) return "DENYLISTED";
        if (code == 6) return "TIER_TOO_LOW";
        if (code == 7) return "COOLDOWN";
        if (code == 8) return "WINDOW_CLOSED";
        if (code == 9) return "EXCEPTION_REQUIRED";
        if (code == 10) return "OVER_COUNTERPARTY_CAP";
        if (code == 11) return "OVER_CATEGORY_CAP";
        if (code == 12) return "OVER_ABSOLUTE_CEILING";
        if (code == 13) return "AGENT_NOT_BOUND";
        if (code == 14) return "INSUFFICIENT_FUNDS";
        if (code == 15) return "OVER_AGENT_CAP";
        if (code == 16) return "ENVELOPE_EXCEEDED";
        if (code == 17) return "AGENT_HEARTBEAT_STALE";
        if (code == 18) return "INTENT_EXPIRED";
        if (code == 19) return "INTENT_USED";
        return "UNKNOWN";
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("LexMandate"), keccak256("1"), block.chainid, address(this)));
    }
    function hashSpendIntent(SpendIntent calldata intent) public view returns (bytes32) {
        bytes32 sh = keccak256(abi.encode(SPEND_INTENT_TYPEHASH, intent.mandateId, intent.amount, intent.counterparty, intent.category, intent.ref, intent.hspOrderId, intent.nonce, intent.deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), sh));
    }
    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]); bytes32 ss = bytes32(sig[32:64]); uint8 v = uint8(sig[64]);
        if (uint256(ss) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, ss);
    }
    function canExecuteIntent(SpendIntent calldata intent, bytes calldata sig) external view returns (bool ok, uint16 reasonCode, address agent) {
        bytes32 digest = hashSpendIntent(intent); agent = _recover(digest, sig);
        if (agent == address(0) || !boundAgents[intent.mandateId][agent]) return (false, 13, agent);
        if (usedIntents[digest] || intent.nonce != intentNonces[agent]) return (false, 19, agent);
        if (block.timestamp > intent.deadline) return (false, 18, agent);
        (ok, reasonCode) = _checkAgentSpend(intent.mandateId, agent, intent.amount, intent.counterparty, intent.category);
    }
    function executeSpendIntent(SpendIntent calldata intent, bytes calldata sig) external returns (uint256 receiptId) {
        bytes32 digest = hashSpendIntent(intent); address agent = _recover(digest, sig);
        require(agent != address(0) && boundAgents[intent.mandateId][agent], "NOT_AGENT");
        require(!usedIntents[digest] && intent.nonce == intentNonces[agent], "INTENT_USED");
        require(block.timestamp <= intent.deadline, "INTENT_EXPIRED");
        usedIntents[digest] = true; intentNonces[agent] = intent.nonce + 1;
        receiptId = _decide(intent.mandateId, agent, intent.amount, intent.counterparty, intent.category, intent.ref, intent.hspOrderId);
        emit SpendIntentExecuted(intent.mandateId, agent, digest, receiptId, msg.sender);
    }

    // ── Internal ───────────────────────────────────────────────────────
    function _computePolicyHash(uint256 mandateId, Rules memory rules) internal pure returns (bytes32) {
        return keccak256(abi.encode(mandateId, rules));
    }
}
