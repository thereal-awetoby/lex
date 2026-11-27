// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Mandate} from "../src/Mandate.sol";
import {MandateFactory} from "../src/MandateFactory.sol";
import {IMandate} from "../src/interfaces/IMandate.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// Per-agent sub-caps, guardian, batch dry-run, and reason strings.
contract MandateAgentCapTest is Test {
    Mandate mandate;
    MockERC20 token;
    address owner = address(0x1);
    address agent = address(0x2);
    address agent2 = address(0x3);
    address counterparty = address(0x4);
    address denylisted = address(0x5);
    address guardianAddr = address(0x6);
    address approver = address(0x7);
    address newKey = address(0x8);
    bytes32 constant COMPUTE = bytes32("compute");

    function setUp() public {
        mandate = (new MandateFactory()).mandate();
        token = new MockERC20("USD Coin", "USDC", 6);
        token.mint(owner, 1_000_000e6);
        vm.prank(owner);
        token.approve(address(mandate), type(uint256).max);
    }

    function _rules() internal pure returns (IMandate.Rules memory) {
        return IMandate.Rules(100e6, 1000e6, 86400, 0, 0, 0, 0, 0, 0, 1000e6,
            IMandate.ExceptionMode.HARD_LAW, IMandate.SettlementRail.DIRECT, 0, 0, 0);
    }

    function _create(IMandate.Rules memory rules) internal returns (uint256 id) {
        address[] memory agents = new address[](2); agents[0] = agent; agents[1] = agent2;
        address[] memory dl = new address[](1); dl[0] = denylisted;
        address[] memory ap = new address[](1); ap[0] = approver;
        vm.prank(owner);
        id = mandate.createMandate(rules, address(token), agents, new address[](0), dl, ap);
        vm.prank(owner); mandate.fund(id, 1000e6);
    }

    function _pay(uint256 id, address who, uint256 amount) internal returns (IMandate.Receipt memory) {
        vm.prank(who);
        uint256 rid = mandate.spend(id, amount, counterparty, COMPUTE, 0, 0);
        return mandate.getReceipt(rid);
    }

    function test_agentCap_refusesOverCap() public {
        uint256 id = _create(_rules());
        vm.prank(owner); mandate.setAgentCap(id, agent, 150e6);
        assertEq(uint8(_pay(id, agent, 100e6).decision), uint8(IMandate.Decision.ALLOW));
        IMandate.Receipt memory r = _pay(id, agent, 60e6);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));
        assertEq(r.reasonCode, 15); assertEq(r.agent, agent);
        assertEq(uint8(_pay(id, agent2, 60e6).decision), uint8(IMandate.Decision.ALLOW));
        (uint256 cap, uint256 spent) = mandate.getAgentCap(id, agent);
        assertEq(cap, 150e6); assertEq(spent, 100e6);
    }

    function test_agentCap_resetsAfterWindow() public {
        uint256 id = _create(_rules());
        vm.prank(owner); mandate.setAgentCap(id, agent, 100e6);
        _pay(id, agent, 100e6); assertEq(_pay(id, agent, 10e6).reasonCode, 15);
        vm.warp(block.timestamp + 86401);
        assertEq(uint8(_pay(id, agent, 100e6).decision), uint8(IMandate.Decision.ALLOW));
    }

    function test_agentCap_notExceptionable() public {
        IMandate.Rules memory rules = _rules(); rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1;
        uint256 id = _create(rules);
        vm.prank(owner); mandate.setAgentCap(id, agent, 50e6);
        assertEq(_pay(id, agent, 150e6).reasonCode, 15);
        vm.prank(agent); vm.expectRevert("OVER_AGENT_CAP");
        mandate.requestException(id, 60e6, counterparty, COMPUTE, "over agent cap");
    }

    function test_agentCap_exceptionCountsAgainstCap() public {
        IMandate.Rules memory rules = _rules(); rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1;
        uint256 id = _create(rules);
        vm.prank(owner); mandate.setAgentCap(id, agent, 200e6);
        vm.prank(agent); uint256 exId = mandate.requestException(id, 150e6, counterparty, COMPUTE, "over tx cap");
        vm.prank(approver); uint256 rid = mandate.approveException(exId, 0);
        assertEq(uint8(mandate.getReceipt(rid).decision), uint8(IMandate.Decision.EXCEPTION));
        assertEq(mandate.getReceipt(rid).agent, agent);
        (, uint256 spent) = mandate.getAgentCap(id, agent);
        assertEq(spent, 150e6); assertEq(_pay(id, agent, 60e6).reasonCode, 15);
    }

    function test_agentCap_onlyOwner() public {
        uint256 id = _create(_rules());
        vm.prank(agent); vm.expectRevert("NOT_OWNER"); mandate.setAgentCap(id, agent, 1);
    }

    function test_agentCap_rotateMigrates() public {
        uint256 id = _create(_rules());
        vm.prank(owner); mandate.setAgentCap(id, agent, 150e6); _pay(id, agent, 100e6);
        vm.prank(owner); mandate.rotateAgent(id, agent, newKey);
        (uint256 cap, uint256 spent) = mandate.getAgentCap(id, newKey);
        assertEq(cap, 150e6); assertEq(spent, 100e6);
        (cap, spent) = mandate.getAgentCap(id, agent); assertEq(cap, 0); assertEq(spent, 0);
        assertEq(_pay(id, newKey, 60e6).reasonCode, 15);
    }

    function test_rotate_rejectsBoundTarget() public {
        uint256 id = _create(_rules());
        vm.prank(owner); vm.expectRevert("ALREADY_BOUND"); mandate.rotateAgent(id, agent, agent2);
    }

    function test_agentCap_escrowCounts() public {
        uint256 id = _create(_rules());
        vm.prank(owner); mandate.setAgentCap(id, agent, 100e6);
        vm.prank(agent); uint256 escrowId = mandate.payWithEscrow(id, counterparty, 80e6, 0, 0, 3600);
        assertGt(escrowId, 0); assertEq(_pay(id, agent, 30e6).reasonCode, 15);
    }

    function test_canAgentSpend_matchesSpend() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setAgentCap(id, agent, 100e6);
        (bool ok, uint16 code) = mandate.canAgentSpend(id, address(0xBEEF), 10e6, counterparty, COMPUTE);
        assertFalse(ok); assertEq(code, 13);
        (ok, code) = mandate.canAgentSpend(id, agent, 100e6, counterparty, COMPUTE);
        assertTrue(ok); assertEq(code, 0);
        assertEq(uint8(_pay(id, agent, 100e6).decision), uint8(IMandate.Decision.ALLOW));
        (ok, code) = mandate.canAgentSpend(id, agent, 1e6, counterparty, COMPUTE);
        assertFalse(ok); assertEq(code, 15); assertEq(_pay(id, agent, 1e6).reasonCode, code);
        (ok,) = mandate.canSpend(id, 1e6, counterparty, COMPUTE); assertTrue(ok);
    }

    function test_guardian_canPauseOnly() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setGuardian(id, guardianAddr);
        assertEq(mandate.guardian(id), guardianAddr); vm.prank(guardianAddr); mandate.pause(id);
        (, bool paused,,,,) = mandate.getMandate(id); assertTrue(paused);
        vm.startPrank(guardianAddr);
        vm.expectRevert("NOT_OWNER"); mandate.unpause(id);
        vm.expectRevert("NOT_OWNER"); mandate.withdraw(id, 1);
        vm.expectRevert("NOT_OWNER"); mandate.proposeRules(id, _rules());
        vm.expectRevert("NOT_OWNER"); mandate.setAgentCap(id, agent, 0);
        vm.expectRevert("NOT_AGENT"); mandate.spend(id, 1e6, counterparty, COMPUTE, 0, 0);
        vm.stopPrank();
    }

    function test_guardian_cleared() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setGuardian(id, guardianAddr);
        vm.prank(owner); mandate.setGuardian(id, address(0));
        vm.prank(guardianAddr); vm.expectRevert("NOT_AUTHORIZED"); mandate.pause(id);
    }

    function test_guardian_onlyOwnerSets() public {
        uint256 id = _create(_rules()); vm.prank(agent); vm.expectRevert("NOT_OWNER"); mandate.setGuardian(id, agent);
    }

    function test_pause_strangerRejected() public {
        uint256 id = _create(_rules()); vm.prank(address(0xBAD)); vm.expectRevert("NOT_AUTHORIZED"); mandate.pause(id);
    }

    function test_canSpendBatch() public {
        uint256 id = _create(_rules());
        uint256[] memory amounts = new uint256[](3); amounts[0] = 50e6; amounts[1] = 150e6; amounts[2] = 10e6;
        address[] memory cps = new address[](3); cps[0] = counterparty; cps[1] = counterparty; cps[2] = denylisted;
        bytes32[] memory cats = new bytes32[](3); for (uint256 i; i < 3; i++) cats[i] = COMPUTE;
        (bool[] memory ok, uint16[] memory codes) = mandate.canSpendBatch(id, amounts, cps, cats);
        assertTrue(ok[0]); assertEq(codes[0], 0); assertFalse(ok[1]); assertEq(codes[1], 2);
        assertFalse(ok[2]); assertEq(codes[2], 5);
    }

    function test_canSpendBatch_lengthMismatch() public {
        uint256 id = _create(_rules()); vm.expectRevert("LENGTH_MISMATCH");
        mandate.canSpendBatch(id, new uint256[](2), new address[](1), new bytes32[](2));
    }

    function test_reasonCodeString() public view {
        assertEq(mandate.reasonCodeString(0), "OK"); assertEq(mandate.reasonCodeString(9), "EXCEPTION_REQUIRED");
        assertEq(mandate.reasonCodeString(15), "OVER_AGENT_CAP"); assertEq(mandate.reasonCodeString(16), "ENVELOPE_EXCEEDED");
        assertEq(mandate.reasonCodeString(17), "AGENT_HEARTBEAT_STALE"); assertEq(mandate.reasonCodeString(18), "INTENT_EXPIRED");
        assertEq(mandate.reasonCodeString(19), "INTENT_USED"); assertEq(mandate.reasonCodeString(99), "UNKNOWN");
    }

    function testFuzz_agentCapHeld(uint8 numSpends, uint256 seed) public {
        uint256 id = _create(_rules()); uint256 cap = 250e6;
        vm.prank(owner); mandate.setAgentCap(id, agent, cap);
        uint256 n = bound(numSpends, 1, 30); uint256 allowed;
        for (uint256 i; i < n; i++) {
            uint256 amount = bound(uint256(keccak256(abi.encode(seed, i))), 1, 100e6);
            IMandate.Receipt memory r = _pay(id, agent, amount);
            if (r.decision == IMandate.Decision.ALLOW) allowed += amount; else assertEq(r.reasonCode, 15);
        }
        assertLe(allowed, cap);
    }
}
