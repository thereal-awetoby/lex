// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import {Mandate} from "../src/Mandate.sol";
import {MandateFactory} from "../src/MandateFactory.sol";
import {IMandate} from "../src/interfaces/IMandate.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
contract MandateLimitsIntentTest is Test {
    Mandate m; MockERC20 token; uint256 constant KEY = 0xa11ce;
    address agent; address owner = address(1); address payee = address(4); bytes32 constant CAT = bytes32("compute"); uint256 id;
    function setUp() public {
        vm.warp(1_700_000_000); agent = vm.addr(KEY); m = (new MandateFactory()).mandate(); token = new MockERC20("USD Coin", "USDC", 6);
        token.mint(owner, 1000e6); vm.prank(owner); token.approve(address(m), type(uint256).max);
        IMandate.Rules memory r = IMandate.Rules(100e6, 1000e6, 86400, 0, 0, 0, 0, 0, 0, 1000e6, IMandate.ExceptionMode.GOVERNED, IMandate.SettlementRail.DIRECT, 1, 0, 0);
        address[] memory agents = new address[](1); agents[0] = agent;
        vm.prank(owner); id = m.createMandate(r, address(token), agents, new address[](0), new address[](0), new address[](0));
        vm.prank(owner); m.fund(id, 1000e6);
    }
    function pay(uint256 amount) internal returns (IMandate.Receipt memory) {
        vm.prank(agent); uint256 rid = m.spend(id, amount, payee, CAT, bytes32(0), bytes32(0)); return m.getReceipt(rid);
    }
    function test_subCapAndRotation() public {
        vm.prank(owner); m.setAgentCap(id, agent, 150e6);
        assertEq(uint8(pay(100e6).decision), 0); assertEq(pay(60e6).reasonCode, 15);
        vm.prank(owner); m.rotateAgent(id, agent, address(8));
        (uint256 cap, uint256 spent) = m.getAgentCap(id, address(8)); assertEq(cap, 150e6); assertEq(spent, 100e6);
        vm.prank(address(8)); uint256 rid = m.spend(id, 60e6, payee, CAT, 0, 0); assertEq(m.getReceipt(rid).reasonCode, 15);
    }
    function test_subCapResets() public {
        vm.prank(owner); m.setAgentCap(id, agent, 100e6); pay(100e6); assertEq(pay(10e6).reasonCode, 15);
        vm.warp(1_700_086_401); assertEq(uint8(pay(100e6).decision), 0);
    }
    function test_governedExceptionRechecksSubCap() public {
        vm.prank(owner); m.setAgentCap(id, agent, 200e6); vm.prank(agent); uint256 e = m.requestException(id, 150e6, payee, CAT, "job");
        vm.prank(owner); m.setAgentCap(id, agent, 100e6); vm.prank(owner); vm.expectRevert("OVER_AGENT_CAP"); m.approveException(e, 0);
    }
    function test_envelopeAndEscrow() public {
        vm.prank(owner); m.setEnvelope(id, CAT, 150e6); pay(100e6); assertEq(m.envelopeRemaining(id, CAT), 50e6); assertEq(pay(60e6).reasonCode, 16);
        vm.prank(owner); m.setEnvelope(id, bytes32("escrow"), 50e6); vm.prank(agent); assertEq(m.payWithEscrow(id, payee, 60e6, 0, 0, 3600), 0);
        assertEq(m.getReceipt(3).reasonCode, 16); vm.prank(agent); vm.expectRevert("ENVELOPE_EXCEEDED"); m.requestException(id, 60e6, payee, CAT, "job");
    }
    function test_heartbeatAndGuardian() public {
        vm.prank(owner); m.setHeartbeatPolicy(id, 3600); assertEq(pay(1e6).reasonCode, 17);
        vm.prank(agent); m.heartbeat(id); assertEq(uint8(pay(1e6).decision), 0); vm.warp(1_700_003_601); assertEq(pay(1e6).reasonCode, 17);
        vm.prank(owner); m.setGuardian(id, address(9)); vm.prank(address(9)); m.pause(id);
        vm.prank(address(9)); vm.expectRevert("NOT_OWNER"); m.unpause(id); assertEq(pay(1e6).reasonCode, 1);
    }
    function intent(uint256 amount, uint256 deadline) internal view returns (IMandate.SpendIntent memory i, bytes memory sig) {
        i = IMandate.SpendIntent(id, amount, payee, CAT, bytes32("ref"), 0, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, m.hashSpendIntent(i)); sig = abi.encodePacked(r, s, v);
    }
    function test_intentAllowReplayAndAgent() public {
        (IMandate.SpendIntent memory i, bytes memory sig) = intent(50e6, block.timestamp + 600);
        (bool ok,, address signer) = m.canExecuteIntent(i, sig); assertTrue(ok); assertEq(signer, agent);
        vm.prank(address(10)); uint256 rid = m.executeSpendIntent(i, sig);
        assertEq(uint8(m.getReceipt(rid).decision), 0); assertEq(m.getReceipt(rid).agent, agent); assertEq(token.balanceOf(payee), 50e6);
        vm.expectRevert("INTENT_USED"); m.executeSpendIntent(i, sig);
    }
    function test_intentRefusalConsumesNonce() public {
        (IMandate.SpendIntent memory i, bytes memory sig) = intent(150e6, block.timestamp + 600);
        uint256 rid = m.executeSpendIntent(i, sig); assertEq(m.getReceipt(rid).reasonCode, 9); assertEq(m.intentNonces(agent), 1);
    }
    function test_intentExpiryAndTamper() public {
        (IMandate.SpendIntent memory i, bytes memory sig) = intent(50e6, block.timestamp + 600);
        i.amount = 51e6; vm.expectRevert("NOT_AGENT"); m.executeSpendIntent(i, sig); i.amount = 50e6;
        vm.warp(1_700_000_601); vm.expectRevert("INTENT_EXPIRED"); m.executeSpendIntent(i, sig); assertEq(m.intentNonces(agent), 0);
    }
    function test_batch() public view {
        uint256[] memory amounts = new uint256[](2); amounts[0] = 50e6; amounts[1] = 150e6;
        address[] memory cps = new address[](2); cps[0] = payee; cps[1] = payee;
        bytes32[] memory cats = new bytes32[](2); cats[0] = CAT; cats[1] = CAT;
        (bool[] memory oks, uint16[] memory codes) = m.canSpendBatch(id, amounts, cps, cats);
        assertTrue(oks[0]); assertFalse(oks[1]); assertEq(codes[1], 2);
    }
    function testFuzz_agentCapHeld(uint8 count, uint256 seed) public {
        vm.prank(owner); m.setAgentCap(id, agent, 250e6);
        uint256 n = bound(count, 1, 20); uint256 paid;
        for (uint256 j; j < n; j++) {
            uint256 amount = bound(uint256(keccak256(abi.encode(seed, j))), 1, 100e6);
            IMandate.Receipt memory r = pay(amount);
            if (r.decision == IMandate.Decision.ALLOW) paid += amount;
            else assertEq(r.reasonCode, 15);
        }
        assertLe(paid, 250e6);
    }
    function test_revokeBlocksPendingException() public {
        vm.prank(agent); uint256 e = m.requestException(id, 150e6, payee, CAT, "job");
        vm.prank(owner); m.revokeAgent(id, agent);
        vm.prank(owner); vm.expectRevert("AGENT_NOT_BOUND"); m.approveException(e, 0);
    }
    function test_intentHighSRejected() public {
        (IMandate.SpendIntent memory i, bytes memory sig) = intent(50e6, block.timestamp + 600);
        bytes32 ss; assembly { ss := mload(add(sig, 64)) }
        bytes32 high = bytes32(0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - uint256(ss));
        assembly { mstore(add(sig, 64), high) }
        vm.expectRevert("NOT_AGENT"); m.executeSpendIntent(i, sig);
    }
}
