// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Mandate} from "../src/Mandate.sol";
import {MandateFactory} from "../src/MandateFactory.sol";
import {IMandate} from "../src/interfaces/IMandate.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract MandateTest is Test {
    Mandate public mandate;
    MandateFactory public factory;
    MockERC20 public usdc;

    address owner = address(0x1);
    address agent = address(0x2);
    address counterparty = address(0x3);
    address counterparty2 = address(0x4);
    address approver1 = address(0x5);
    address approver2 = address(0x6);
    address denylisted = address(0x7);

    uint256 mandateId;

    function setUp() public {
        factory = new MandateFactory();
        mandate = factory.mandate();
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Mint and approve
        usdc.mint(owner, 1_000_000e6);
        vm.prank(owner);
        usdc.approve(address(mandate), type(uint256).max);
    }

    function _defaultRules() internal pure returns (IMandate.Rules memory) {
        return IMandate.Rules({
            perTxCap: 100e6,            // 100 USDC
            rollingWindowCap: 500e6,     // 500 USDC per 24h
            rollingWindowDuration: 86400,
            perCounterpartyCap: 200e6,   // 200 per counterparty
            perCategoryCap: 300e6,       // 300 per category
            cooldownSeconds: 60,
            activeWindowStart: 0,
            activeWindowEnd: 0,
            minCounterpartyTier: 0,
            absoluteCeiling: 1000e6,
            exceptionMode: IMandate.ExceptionMode.HARD_LAW,
            preferredRail: IMandate.SettlementRail.HSP,
            exceptionApprovalThreshold: 0,
            exceptionTimeDelay: 0,
            timelockForRuleChange: 0
        });
    }

    function _createDefaultMandate() internal returns (uint256) {
        address[] memory agents = new address[](1);
        agents[0] = agent;
        address[] memory al = new address[](1);
        al[0] = counterparty;
        address[] memory dl = new address[](1);
        dl[0] = denylisted;
        address[] memory ap = new address[](0);

        vm.prank(owner);
        return mandate.createMandate(
            _defaultRules(),
            address(usdc),
            agents,
            al,
            dl,
            ap
        );
    }

    function _fundMandate(uint256 _mandateId, uint256 amount) internal {
        vm.prank(owner);
        mandate.fund(_mandateId, amount);
    }

    // ── Creation tests ─────────────────────────────────────────────────

    function test_createMandate() public {
        mandateId = _createDefaultMandate();
        assertEq(mandateId, 1);

        (address _owner,,address _token, uint256 _balance,,) = mandate.getMandate(mandateId);
        assertEq(_owner, owner);
        assertEq(_token, address(usdc));
        assertEq(_balance, 0);
    }

    function test_fundMandate() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        (,,, uint256 balance,,) = mandate.getMandate(mandateId);
        assertEq(balance, 500e6);
    }

    // ── canSpend tests ─────────────────────────────────────────────────

    function test_canSpend_ok() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 50e6, counterparty, bytes32("compute"));
        assertTrue(ok);
        assertEq(reason, 0);
    }

    function test_canSpend_overTxCap() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 150e6, counterparty, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 2); // OVER_TX_CAP
    }

    function test_canSpend_notAllowlisted() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 50e6, counterparty2, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 4); // NOT_ALLOWLISTED
    }

    function test_canSpend_denylisted() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        // Add denylisted to allowlist too, denylist should take priority
        vm.prank(owner);
        mandate.setAllowlisted(mandateId, denylisted, true);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 50e6, denylisted, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 5); // DENYLISTED
    }

    function test_canSpend_paused() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(owner);
        mandate.pause(mandateId);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 50e6, counterparty, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 1); // PAUSED
    }

    function test_canSpend_insufficientFunds() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 10e6);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 50e6, counterparty, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 14); // INSUFFICIENT_FUNDS
    }

    // ── Spend tests ────────────────────────────────────────────────────

    function test_spend_allow() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 50e6, counterparty, bytes32("compute"), bytes32("inv-1"), bytes32(0));

        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.ALLOW));
        assertEq(r.amount, 50e6);
        assertEq(usdc.balanceOf(counterparty), 50e6);
    }

    function test_spend_refuse_overTxCap() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 150e6, counterparty, bytes32("compute"), bytes32("inv-1"), bytes32(0));

        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));
        assertEq(r.reasonCode, 2);
        assertEq(usdc.balanceOf(counterparty), 0); // no transfer
    }

    function test_spend_refuse_denylisted() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(owner);
        mandate.setAllowlisted(mandateId, denylisted, true);

        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 50e6, denylisted, bytes32("compute"), bytes32("inv-1"), bytes32(0));

        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));
        assertEq(r.reasonCode, 5); // DENYLISTED
    }

    function test_spend_notAgent_reverts() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(counterparty);
        vm.expectRevert("NOT_AGENT");
        mandate.spend(mandateId, 50e6, counterparty, bytes32("compute"), bytes32("inv-1"), bytes32(0));
    }

    // ── Rolling window tests ───────────────────────────────────────────

    function test_rollingWindow_caps() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 1000e6);

        // Spend 100 five times = 500 (at cap)
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(block.timestamp + 61); // cooldown
            vm.prank(agent);
            mandate.spend(mandateId, 100e6, counterparty, bytes32("compute"), bytes32(bytes1(uint8(i))), bytes32(0));
        }

        // 6th should fail (over rolling)
        vm.warp(block.timestamp + 61);
        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 100e6, counterparty, bytes32("compute"), bytes32("inv-6"), bytes32(0));
        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));
        // Could be OVER_ROLLING(3) or OVER_COUNTERPARTY_CAP(10)
        assertTrue(r.reasonCode == 3 || r.reasonCode == 10);
    }

    function test_rollingWindow_resets() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 1000e6);

        // Spend to cap
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(block.timestamp + 61);
            vm.prank(agent);
            mandate.spend(mandateId, 100e6, counterparty, bytes32("compute"), bytes32(bytes1(uint8(i))), bytes32(0));
        }

        // Advance past window
        vm.warp(block.timestamp + 86401);

        // Should succeed again
        (bool ok,) = mandate.canSpend(mandateId, 100e6, counterparty, bytes32("compute"));
        assertTrue(ok);
    }

    // ── Cooldown test ──────────────────────────────────────────────────

    function test_cooldown() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        mandate.spend(mandateId, 10e6, counterparty, bytes32("compute"), bytes32("inv-1"), bytes32(0));

        // Immediate second spend — cooldown should refuse
        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 10e6, counterparty, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 7); // COOLDOWN
    }

    // ── Agent management tests ─────────────────────────────────────────

    function test_bindAndRevoke() public {
        mandateId = _createDefaultMandate();
        address newAgent = address(0x99);

        vm.prank(owner);
        mandate.bindAgent(mandateId, newAgent);
        assertTrue(mandate.isAgentBound(mandateId, newAgent));

        vm.prank(owner);
        mandate.revokeAgent(mandateId, newAgent);
        assertFalse(mandate.isAgentBound(mandateId, newAgent));
    }

    function test_rotateAgent() public {
        mandateId = _createDefaultMandate();
        address newAgent = address(0x99);

        vm.prank(owner);
        mandate.rotateAgent(mandateId, agent, newAgent);

        assertFalse(mandate.isAgentBound(mandateId, agent));
        assertTrue(mandate.isAgentBound(mandateId, newAgent));
    }

    // ── Exception tests (hard law) ─────────────────────────────────────

    function test_hardLaw_noExceptionPath() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        vm.expectRevert("HARD_LAW");
        mandate.requestException(mandateId, 150e6, counterparty, bytes32("compute"), "need more");
    }

    // ── Exception tests (governed) ─────────────────────────────────────

    function test_governed_exceptionFlow() public {
        // Create governed mandate
        IMandate.Rules memory rules = _defaultRules();
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1;

        address[] memory agents = new address[](1);
        agents[0] = agent;
        address[] memory al = new address[](1);
        al[0] = counterparty;
        address[] memory dl = new address[](0);
        address[] memory ap = new address[](1);
        ap[0] = approver1;

        vm.prank(owner);
        mandateId = mandate.createMandate(rules, address(usdc), agents, al, dl, ap);
        _fundMandate(mandateId, 500e6);

        // Agent requests exception for over-cap amount
        vm.prank(agent);
        uint256 exceptionId = mandate.requestException(
            mandateId, 150e6, counterparty, bytes32("compute"), "urgent compute needed"
        );

        IMandate.ExceptionRequest memory e = mandate.getException(exceptionId);
        assertEq(e.amount, 150e6);
        assertFalse(e.resolved);

        // Approver approves — should execute since threshold = 1
        vm.prank(approver1);
        uint256 receiptId = mandate.approveException(exceptionId, bytes32(0));

        e = mandate.getException(exceptionId);
        assertTrue(e.resolved);
        assertTrue(e.approved);

        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.EXCEPTION));
        assertEq(r.exceptionId, exceptionId);
        assertEq(usdc.balanceOf(counterparty), 150e6);
    }

    function test_governed_cannotExceptionDenylisted() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;

        address[] memory agents = new address[](1);
        agents[0] = agent;
        address[] memory al = new address[](0);
        address[] memory dl = new address[](1);
        dl[0] = denylisted;
        address[] memory ap = new address[](0);

        vm.prank(owner);
        mandateId = mandate.createMandate(rules, address(usdc), agents, al, dl, ap);

        vm.prank(agent);
        vm.expectRevert("DENYLISTED_NO_EXCEPTION");
        mandate.requestException(mandateId, 50e6, denylisted, bytes32("compute"), "testing");
    }

    function test_governed_cannotExceedAbsoluteCeiling() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.absoluteCeiling = 500e6;

        address[] memory agents = new address[](1);
        agents[0] = agent;
        address[] memory al = new address[](1);
        al[0] = counterparty;
        address[] memory dl = new address[](0);
        address[] memory ap = new address[](0);

        vm.prank(owner);
        mandateId = mandate.createMandate(rules, address(usdc), agents, al, dl, ap);

        vm.prank(agent);
        vm.expectRevert("OVER_ABSOLUTE_CEILING");
        mandate.requestException(mandateId, 600e6, counterparty, bytes32("compute"), "too much");
    }

    // ── Escrow tests ───────────────────────────────────────────────────

    function test_escrow_lockAttestRelease() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 escrowId = mandate.payWithEscrow(
            mandateId, counterparty, 50e6, bytes32("schema-1"), bytes32("ref-1"), 3600
        );

        IMandate.EscrowLeg memory e = mandate.getEscrow(escrowId);
        assertEq(uint8(e.state), uint8(IMandate.EscrowState.LOCKED));
        assertEq(e.amount, 50e6);

        // Attest
        vm.prank(counterparty);
        mandate.attestEscrow(escrowId);
        e = mandate.getEscrow(escrowId);
        assertEq(uint8(e.state), uint8(IMandate.EscrowState.ATTESTED));

        // Release
        vm.prank(owner);
        mandate.releaseEscrow(escrowId);
        e = mandate.getEscrow(escrowId);
        assertEq(uint8(e.state), uint8(IMandate.EscrowState.RELEASED));
        assertEq(usdc.balanceOf(counterparty), 50e6);
    }

    function test_escrow_refundOnTimeout() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 escrowId = mandate.payWithEscrow(
            mandateId, counterparty, 50e6, bytes32("schema-1"), bytes32("ref-1"), 3600
        );

        // Advance past timeout
        vm.warp(block.timestamp + 3601);

        vm.prank(owner);
        mandate.refundEscrow(escrowId);

        IMandate.EscrowLeg memory e = mandate.getEscrow(escrowId);
        assertEq(uint8(e.state), uint8(IMandate.EscrowState.REFUNDED));

        (,,, uint256 balance,,) = mandate.getMandate(mandateId);
        assertEq(balance, 500e6); // balance restored
    }

    // ── Pause tests ────────────────────────────────────────────────────

    function test_pause_blocksSpend() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(owner);
        mandate.pause(mandateId);

        vm.prank(agent);
        vm.expectRevert("PAUSED");
        mandate.spend(mandateId, 50e6, counterparty, bytes32("compute"), bytes32("inv-1"), bytes32(0));
    }

    function test_unpause() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(owner);
        mandate.pause(mandateId);

        vm.prank(owner);
        mandate.unpause(mandateId);

        (bool ok,) = mandate.canSpend(mandateId, 50e6, counterparty, bytes32("compute"));
        assertTrue(ok);
    }

    // ── Withdraw tests ─────────────────────────────────────────────────

    function test_ownerWithdraw() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        uint256 before = usdc.balanceOf(owner);
        vm.prank(owner);
        mandate.withdraw(mandateId, 200e6);

        assertEq(usdc.balanceOf(owner), before + 200e6);
        (,,, uint256 balance,,) = mandate.getMandate(mandateId);
        assertEq(balance, 300e6);
    }

    // ── Rules update + timelock ────────────────────────────────────────

    function test_rulesUpdate_noTimelock() public {
        mandateId = _createDefaultMandate();
        IMandate.Rules memory newRules = _defaultRules();
        newRules.perTxCap = 200e6;

        vm.prank(owner);
        mandate.proposeRules(mandateId, newRules);

        _fundMandate(mandateId, 500e6);
        (bool ok,) = mandate.canSpend(mandateId, 150e6, counterparty, bytes32("compute"));
        assertTrue(ok); // new cap is 200
    }

    function test_rulesUpdate_withTimelock() public {
        // First set rules with a timelock
        IMandate.Rules memory rules = _defaultRules();
        rules.timelockForRuleChange = 3600; // 1 hour

        address[] memory agents = new address[](1);
        agents[0] = agent;
        address[] memory al = new address[](1);
        al[0] = counterparty;
        address[] memory dl = new address[](0);
        address[] memory ap = new address[](0);

        vm.prank(owner);
        mandateId = mandate.createMandate(rules, address(usdc), agents, al, dl, ap);

        // Propose new rules
        IMandate.Rules memory newRules = rules;
        newRules.perTxCap = 200e6;

        vm.prank(owner);
        mandate.proposeRules(mandateId, newRules);

        // Try to execute immediately — should fail
        vm.prank(owner);
        vm.expectRevert("TIMELOCK_ACTIVE");
        mandate.executeRuleChange(mandateId);

        // Advance time
        vm.warp(block.timestamp + 3601);

        vm.prank(owner);
        mandate.executeRuleChange(mandateId);

        _fundMandate(mandateId, 500e6);
        (bool ok,) = mandate.canSpend(mandateId, 150e6, counterparty, bytes32("compute"));
        assertTrue(ok);
    }

    // ── Invariant: no spend to denylisted ──────────────────────────────

    function test_invariant_noDenylistSpend() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        // Even in governed mode, denylisted stays denied
        IMandate.Rules memory rules = _defaultRules();
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1;

        // Need a new mandate for governed mode
        address[] memory agents = new address[](1);
        agents[0] = agent;
        address[] memory al = new address[](0); // no allowlist
        address[] memory dl = new address[](1);
        dl[0] = denylisted;
        address[] memory ap = new address[](1);
        ap[0] = approver1;

        vm.prank(owner);
        uint256 govMandateId = mandate.createMandate(rules, address(usdc), agents, al, dl, ap);
        _fundMandate(govMandateId, 500e6);

        // Try direct spend to denylisted
        vm.prank(agent);
        uint256 receiptId = mandate.spend(govMandateId, 50e6, denylisted, bytes32("compute"), bytes32("inv-1"), bytes32(0));
        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));

        // Cannot even request exception for denylisted
        vm.prank(agent);
        vm.expectRevert("DENYLISTED_NO_EXCEPTION");
        mandate.requestException(govMandateId, 50e6, denylisted, bytes32("compute"), "testing");

        // Confirm denylisted received nothing
        assertEq(usdc.balanceOf(denylisted), 0);
    }

    // ── Fuzz: spend never exceeds per-tx cap ───────────────────────────

    function testFuzz_perTxCap(uint256 amount) public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 1000e6);

        amount = bound(amount, 1, 1000e6);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, amount, counterparty, bytes32("compute"));

        if (amount > 100e6) {
            assertFalse(ok);
            assertEq(reason, 2); // OVER_TX_CAP
        }
    }

    // ── Fuzz: rolling window invariant ─────────────────────────────────

    function testFuzz_rollingWindowInvariant(uint8 numSpends, uint256 seed) public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 10_000e6);

        numSpends = uint8(bound(numSpends, 1, 20));
        uint256 totalSpent = 0;

        for (uint256 i = 0; i < numSpends; i++) {
            uint256 amount = uint256(keccak256(abi.encode(seed, i))) % 90e6 + 1e6;
            vm.warp(block.timestamp + 61); // respect cooldown
            vm.prank(agent);
            uint256 rid = mandate.spend(mandateId, amount, counterparty, bytes32("compute"), bytes32(bytes1(uint8(i))), bytes32(0));
            IMandate.Receipt memory r = mandate.getReceipt(rid);
            if (r.decision == IMandate.Decision.ALLOW) {
                totalSpent += amount;
            }
        }

        // Rolling window spent should never exceed cap
        assertTrue(totalSpent <= 500e6);
    }
}
