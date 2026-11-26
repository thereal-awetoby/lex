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

    function _createMandateWithRules(IMandate.Rules memory rules, address[] memory ap) internal returns (uint256) {
        address[] memory agents = new address[](1);
        agents[0] = agent;
        address[] memory al = new address[](1);
        al[0] = counterparty;
        address[] memory dl = new address[](1);
        dl[0] = denylisted;
        vm.prank(owner);
        return mandate.createMandate(rules, address(usdc), agents, al, dl, ap);
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
        IMandate.Rules memory rules = _defaultRules();
        rules.perCounterpartyCap = 0;
        rules.perCategoryCap = 0;
        mandateId = _createMandateWithRules(rules, new address[](0));
        _fundMandate(mandateId, 1000e6);

        // Spend 100 five times = 500 (at cap)
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(vm.getBlockTimestamp() + 61); // cooldown
            vm.prank(agent);
            uint256 rid = mandate.spend(mandateId, 100e6, counterparty, bytes32("compute"), bytes32(bytes1(uint8(i))), bytes32(0));
            assertEq(uint8(mandate.getReceipt(rid).decision), uint8(IMandate.Decision.ALLOW));
        }

        // 6th should fail (over rolling)
        vm.warp(vm.getBlockTimestamp() + 61);
        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 100e6, counterparty, bytes32("compute"), bytes32("inv-6"), bytes32(0));
        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));
        assertEq(r.reasonCode, 3); // OVER_ROLLING
    }

    function test_rollingWindow_resets() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.perCounterpartyCap = 0;
        rules.perCategoryCap = 0;
        mandateId = _createMandateWithRules(rules, new address[](0));
        _fundMandate(mandateId, 1000e6);

        // Spend to cap
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(vm.getBlockTimestamp() + 61);
            vm.prank(agent);
            uint256 rid = mandate.spend(mandateId, 100e6, counterparty, bytes32("compute"), bytes32(bytes1(uint8(i))), bytes32(0));
            assertEq(uint8(mandate.getReceipt(rid).decision), uint8(IMandate.Decision.ALLOW));
        }

        // Advance past window
        vm.warp(vm.getBlockTimestamp() + 86401);

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

        // Payer side attests delivery
        vm.prank(agent);
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
        vm.warp(vm.getBlockTimestamp() + 3601);

        vm.prank(owner);
        mandate.refundEscrow(escrowId);

        IMandate.EscrowLeg memory e = mandate.getEscrow(escrowId);
        assertEq(uint8(e.state), uint8(IMandate.EscrowState.REFUNDED));

        (,,, uint256 balance,,) = mandate.getMandate(mandateId);
        assertEq(balance, 500e6); // balance restored
    }

    function test_escrow_counterpartyCannotAttest() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 escrowId = mandate.payWithEscrow(
            mandateId, counterparty, 50e6, bytes32("schema-1"), bytes32("ref-1"), 3600
        );

        vm.prank(counterparty);
        vm.expectRevert("NOT_AUTHORIZED");
        mandate.attestEscrow(escrowId);
    }

    function test_escrow_noRefundBeforeTimeout() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 escrowId = mandate.payWithEscrow(
            mandateId, counterparty, 50e6, bytes32("schema-1"), bytes32("ref-1"), 3600
        );

        vm.prank(owner);
        vm.expectRevert("NOT_REFUNDABLE");
        mandate.refundEscrow(escrowId);
    }

    function test_escrow_requiresTimeout() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        vm.expectRevert("TIMEOUT_REQUIRED");
        mandate.payWithEscrow(mandateId, counterparty, 50e6, bytes32("schema-1"), bytes32("ref-1"), 0);
    }

    function test_escrow_writesReceipt() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 escrowId = mandate.payWithEscrow(
            mandateId, counterparty, 50e6, bytes32("schema-1"), bytes32("ref-1"), 3600
        );

        IMandate.Receipt memory r = mandate.getReceipt(1);
        assertEq(r.mandateId, mandateId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.ALLOW));
        assertEq(r.amount, 50e6);
        assertEq(r.txRef, bytes32(escrowId));
    }

    function test_escrow_countsAgainstCounterpartyCap() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        // Two 100 escrows reach the 200 per-counterparty cap
        vm.prank(agent);
        mandate.payWithEscrow(mandateId, counterparty, 100e6, bytes32("s"), bytes32("r1"), 3600);
        vm.warp(vm.getBlockTimestamp() + 61);
        vm.prank(agent);
        mandate.payWithEscrow(mandateId, counterparty, 100e6, bytes32("s"), bytes32("r2"), 3600);
        vm.warp(vm.getBlockTimestamp() + 61);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 50e6, counterparty, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 10); // OVER_COUNTERPARTY_CAP
    }

    // ── ID isolation across mandates ───────────────────────────────────

    function test_ids_globalAcrossMandates() public {
        uint256 m1 = _createDefaultMandate();
        uint256 m2 = _createDefaultMandate();
        _fundMandate(m1, 500e6);
        _fundMandate(m2, 500e6);

        vm.prank(agent);
        uint256 r1 = mandate.spend(m1, 10e6, counterparty, bytes32("compute"), bytes32("a"), bytes32(0));
        vm.prank(agent);
        uint256 r2 = mandate.spend(m2, 20e6, counterparty, bytes32("compute"), bytes32("b"), bytes32(0));

        assertTrue(r1 != r2);
        assertEq(mandate.getReceipt(r1).mandateId, m1);
        assertEq(mandate.getReceipt(r1).amount, 10e6);
        assertEq(mandate.getReceipt(r2).mandateId, m2);

        vm.warp(vm.getBlockTimestamp() + 61); // cooldown
        vm.prank(agent);
        uint256 e1 = mandate.payWithEscrow(m1, counterparty, 10e6, bytes32("s"), bytes32("r"), 3600);
        vm.prank(agent);
        uint256 e2 = mandate.payWithEscrow(m2, counterparty, 10e6, bytes32("s"), bytes32("r"), 3600);
        assertTrue(e1 != e2);
        assertEq(mandate.getEscrow(e1).mandateId, m1);
        assertEq(mandate.getEscrow(e2).mandateId, m2);
    }

    // ── Exception time delay ───────────────────────────────────────────

    function test_governed_timeDelayExecution() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionTimeDelay = 3600;
        address[] memory ap = new address[](1);
        ap[0] = approver1;
        mandateId = _createMandateWithRules(rules, ap);
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 exceptionId = mandate.requestException(
            mandateId, 150e6, counterparty, bytes32("compute"), "over cap"
        );

        vm.prank(approver1);
        uint256 rid = mandate.approveException(exceptionId, bytes32(0));
        assertEq(rid, 0); // not executed yet

        vm.prank(agent);
        vm.expectRevert("DELAY_NOT_PASSED");
        mandate.executeException(exceptionId, bytes32(0));

        vm.warp(vm.getBlockTimestamp() + 3601);
        vm.prank(agent);
        uint256 receiptId = mandate.executeException(exceptionId, bytes32(0));

        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.EXCEPTION));
        assertEq(usdc.balanceOf(counterparty), 150e6);
    }

    function test_governed_exceptionBlockedIfDenylistedAfterRequest() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1;
        address[] memory ap = new address[](1);
        ap[0] = approver1;
        mandateId = _createMandateWithRules(rules, ap);
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 exceptionId = mandate.requestException(
            mandateId, 150e6, counterparty, bytes32("compute"), "over cap"
        );

        vm.prank(owner);
        mandate.setDenylisted(mandateId, counterparty, true);

        vm.prank(approver1);
        vm.expectRevert("DENYLISTED_NO_EXCEPTION");
        mandate.approveException(exceptionId, bytes32(0));
    }

    function test_tier_enforced() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.minCounterpartyTier = 2;
        mandateId = _createMandateWithRules(rules, new address[](0));
        _fundMandate(mandateId, 500e6);

        (bool ok, uint16 reason) = mandate.canSpend(mandateId, 50e6, counterparty, bytes32("compute"));
        assertFalse(ok);
        assertEq(reason, 6); // TIER_TOO_LOW

        vm.prank(owner);
        mandate.setCounterpartyTier(mandateId, counterparty, 1);
        (ok, reason) = mandate.canSpend(mandateId, 50e6, counterparty, bytes32("compute"));
        assertEq(reason, 6);

        vm.prank(owner);
        mandate.setCounterpartyTier(mandateId, counterparty, 2);
        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 50e6, counterparty, bytes32("compute"), bytes32(0), bytes32(0));
        assertEq(uint8(mandate.getReceipt(receiptId).decision), uint8(IMandate.Decision.ALLOW));
    }

    function test_tier_onlyOwnerSets() public {
        mandateId = _createDefaultMandate();
        vm.prank(agent);
        vm.expectRevert("NOT_OWNER");
        mandate.setCounterpartyTier(mandateId, counterparty, 5);
    }

    function test_tier_refusalAndEscrow() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.minCounterpartyTier = 2;
        mandateId = _createMandateWithRules(rules, new address[](0));
        _fundMandate(mandateId, 500e6);

        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 50e6, counterparty, bytes32("compute"), bytes32(0), bytes32(0));
        assertEq(uint8(mandate.getReceipt(receiptId).decision), uint8(IMandate.Decision.REFUSE));
        assertEq(mandate.getReceipt(receiptId).reasonCode, 6);

        vm.prank(agent);
        vm.expectRevert("SPEND_CHECK_FAILED:6");
        mandate.payWithEscrow(mandateId, counterparty, 50e6, bytes32("s"), bytes32("r"), 3600);
    }

    function test_tier_isIsolatedByMandate() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.minCounterpartyTier = 2;
        uint256 first = _createMandateWithRules(rules, new address[](0));
        uint256 second = _createMandateWithRules(rules, new address[](0));
        _fundMandate(first, 500e6);
        _fundMandate(second, 500e6);
        vm.prank(owner);
        mandate.setCounterpartyTier(first, counterparty, 2);
        (bool firstOk,) = mandate.canSpend(first, 50e6, counterparty, bytes32("compute"));
        (bool secondOk, uint16 reason) = mandate.canSpend(second, 50e6, counterparty, bytes32("compute"));
        assertTrue(firstOk);
        assertFalse(secondOk);
        assertEq(reason, 6);
        assertEq(mandate.counterpartyTier(first, counterparty), 2);
        assertEq(mandate.counterpartyTier(second, counterparty), 0);
    }

    function test_tier_governedExceptionCanOverride() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.minCounterpartyTier = 2;
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1;
        address[] memory ap = new address[](1);
        ap[0] = approver1;
        mandateId = _createMandateWithRules(rules, ap);
        _fundMandate(mandateId, 500e6);
        vm.prank(agent);
        uint256 exceptionId = mandate.requestException(mandateId, 50e6, counterparty, bytes32("compute"), "tier exception");
        vm.prank(approver1);
        uint256 receiptId = mandate.approveException(exceptionId, bytes32(0));
        assertEq(uint8(mandate.getReceipt(receiptId).decision), uint8(IMandate.Decision.EXCEPTION));
        assertEq(usdc.balanceOf(counterparty), 50e6);
    }

    function test_canSpend_denylistNotMaskedByAllowlist() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);
        // denylisted is not on the allowlist; reason must still be DENYLISTED
        (, uint16 reason) = mandate.canSpend(mandateId, 50e6, denylisted, bytes32("compute"));
        assertEq(reason, 5);
    }

    // ── Pause tests ────────────────────────────────────────────────────

    function test_pause_blocksSpend() public {
        mandateId = _createDefaultMandate();
        _fundMandate(mandateId, 500e6);

        vm.prank(owner);
        mandate.pause(mandateId);

        // Paused spend does not revert: it records a REFUSE receipt with reason PAUSED
        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 50e6, counterparty, bytes32("compute"), bytes32("inv-1"), bytes32(0));

        IMandate.Receipt memory r = mandate.getReceipt(receiptId);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));
        assertEq(r.reasonCode, 1); // PAUSED
        assertEq(usdc.balanceOf(counterparty), 0);
    }

    function test_pause_governedStillRefusesWithPaused() public {
        IMandate.Rules memory rules = _defaultRules();
        rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        mandateId = _createMandateWithRules(rules, new address[](0));
        _fundMandate(mandateId, 500e6);

        vm.prank(owner);
        mandate.pause(mandateId);

        vm.prank(agent);
        uint256 receiptId = mandate.spend(mandateId, 50e6, counterparty, bytes32("compute"), bytes32(0), bytes32(0));
        assertEq(mandate.getReceipt(receiptId).reasonCode, 1); // PAUSED, not EXCEPTION_REQUIRED
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
        vm.warp(vm.getBlockTimestamp() + 3601);

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
            vm.warp(vm.getBlockTimestamp() + 61); // respect cooldown
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
