// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Mandate} from "../src/Mandate.sol";
import {MandateFactory} from "../src/MandateFactory.sol";
import {IMandate} from "../src/interfaces/IMandate.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// Category envelopes, heartbeat, signed intents, and cross-feature properties.
contract MandateEnvelopesIntentTest is Test {
    Mandate mandate;
    MockERC20 token;
    uint256 constant AGENT_KEY = 0xA11CE;
    address agent;
    address owner = address(0x1);
    address counterparty = address(0x4);
    address denylisted = address(0x5);
    address approver = address(0x7);
    address relayer = address(0x9);
    bytes32 constant COMPUTE = bytes32("compute");
    bytes32 constant DATA = bytes32("data");

    function setUp() public {
        agent = vm.addr(AGENT_KEY);
        mandate = (new MandateFactory()).mandate();
        token = new MockERC20("USD Coin", "USDC", 6);
        token.mint(owner, 1_000_000e6);
        vm.prank(owner); token.approve(address(mandate), type(uint256).max);
        vm.warp(1_700_000_000);
    }

    function _rules() internal pure returns (IMandate.Rules memory) {
        return IMandate.Rules(100e6, 1000e6, 86400, 0, 0, 0, 0, 0, 0, 1000e6,
            IMandate.ExceptionMode.HARD_LAW, IMandate.SettlementRail.DIRECT, 0, 0, 0);
    }

    function _create(IMandate.Rules memory rules) internal returns (uint256 id) {
        address[] memory agents = new address[](1); agents[0] = agent;
        address[] memory dl = new address[](1); dl[0] = denylisted;
        address[] memory ap = new address[](1); ap[0] = approver;
        vm.prank(owner); id = mandate.createMandate(rules, address(token), agents, new address[](0), dl, ap);
        vm.prank(owner); mandate.fund(id, 1000e6);
    }

    function _pay(uint256 id, uint256 amount, bytes32 category) internal returns (IMandate.Receipt memory) {
        vm.prank(agent); uint256 rid = mandate.spend(id, amount, counterparty, category, 0, 0);
        return mandate.getReceipt(rid);
    }

    function _intent(uint256 id, uint256 amount, uint256 nonce, uint256 deadline)
        internal view returns (IMandate.SpendIntent memory)
    {
        return IMandate.SpendIntent(id, amount, counterparty, COMPUTE, bytes32("invoice-1"), 0, nonce, deadline);
    }

    function _sign(uint256 key, IMandate.SpendIntent memory intent) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, mandate.hashSpendIntent(intent));
        return abi.encodePacked(r, s, v);
    }

    function test_envelope_limitsCategory() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setEnvelope(id, COMPUTE, 150e6);
        assertEq(uint8(_pay(id, 100e6, COMPUTE).decision), uint8(IMandate.Decision.ALLOW));
        assertEq(mandate.envelopeRemaining(id, COMPUTE), 50e6);
        IMandate.Receipt memory r = _pay(id, 60e6, COMPUTE);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE)); assertEq(r.reasonCode, 16);
        assertEq(uint8(_pay(id, 60e6, DATA).decision), uint8(IMandate.Decision.ALLOW));
        assertEq(mandate.envelopeRemaining(id, DATA), type(uint256).max);
    }

    function test_envelope_raiseAndClear() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setEnvelope(id, COMPUTE, 150e6);
        _pay(id, 100e6, COMPUTE); vm.prank(owner); mandate.setEnvelope(id, COMPUTE, 250e6);
        assertEq(mandate.envelopeRemaining(id, COMPUTE), 150e6);
        assertEq(uint8(_pay(id, 100e6, COMPUTE).decision), uint8(IMandate.Decision.ALLOW));
        vm.prank(owner); mandate.setEnvelope(id, COMPUTE, 0);
        (uint256 budget, uint256 spent) = mandate.getEnvelope(id, COMPUTE);
        assertEq(budget, 0); assertEq(spent, 0); assertEq(mandate.envelopeRemaining(id, COMPUTE), type(uint256).max);
    }

    function test_envelope_notExceptionable() public {
        IMandate.Rules memory rules = _rules(); rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1; uint256 id = _create(rules);
        vm.prank(owner); mandate.setEnvelope(id, COMPUTE, 100e6);
        assertEq(_pay(id, 150e6, COMPUTE).reasonCode, 16);
        vm.prank(agent); vm.expectRevert("ENVELOPE_EXCEEDED");
        mandate.requestException(id, 150e6, counterparty, COMPUTE, "over envelope");
    }

    function test_envelope_escrowCategory() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setEnvelope(id, bytes32("escrow"), 50e6);
        vm.prank(agent); uint256 escrowId = mandate.payWithEscrow(id, counterparty, 60e6, 0, 0, 3600);
        assertEq(escrowId, 0); assertEq(mandate.getReceipt(1).reasonCode, 16);
    }

    function test_envelope_onlyOwner() public {
        uint256 id = _create(_rules()); vm.prank(agent); vm.expectRevert("NOT_OWNER");
        mandate.setEnvelope(id, COMPUTE, 1);
    }

    function test_heartbeat_requiredWhenSet() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setHeartbeatPolicy(id, 3600);
        assertEq(_pay(id, 10e6, COMPUTE).reasonCode, 17);
        vm.prank(agent); mandate.heartbeat(id);
        assertEq(uint8(_pay(id, 10e6, COMPUTE).decision), uint8(IMandate.Decision.ALLOW));
        vm.warp(block.timestamp + 3601);
        (bool ok, uint16 code) = mandate.canAgentSpend(id, agent, 10e6, counterparty, COMPUTE);
        assertFalse(ok); assertEq(code, 17); assertEq(_pay(id, 10e6, COMPUTE).reasonCode, 17);
        vm.prank(agent); mandate.heartbeat(id);
        assertEq(uint8(_pay(id, 10e6, COMPUTE).decision), uint8(IMandate.Decision.ALLOW));
    }

    function test_heartbeat_offByDefault() public {
        uint256 id = _create(_rules());
        assertEq(uint8(_pay(id, 10e6, COMPUTE).decision), uint8(IMandate.Decision.ALLOW));
    }

    function test_heartbeat_onlyAgent() public {
        uint256 id = _create(_rules()); vm.prank(owner); vm.expectRevert("NOT_AGENT"); mandate.heartbeat(id);
    }

    function test_heartbeat_staleBlocksException() public {
        IMandate.Rules memory rules = _rules(); rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1; uint256 id = _create(rules);
        vm.prank(owner); mandate.setHeartbeatPolicy(id, 3600); vm.prank(agent); mandate.heartbeat(id);
        vm.prank(agent); uint256 exId = mandate.requestException(id, 150e6, counterparty, COMPUTE, "over tx cap");
        vm.warp(block.timestamp + 3601); vm.prank(approver); vm.expectRevert("AGENT_HEARTBEAT_STALE");
        mandate.approveException(exId, 0);
    }

    function test_intent_domainSeparator() public view {
        bytes32 expected = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("LexMandate"), keccak256("1"), block.chainid, address(mandate)));
        assertEq(mandate.domainSeparator(), expected);
    }

    function test_intent_relayerExecutes() public {
        uint256 id = _create(_rules());
        IMandate.SpendIntent memory intent = _intent(id, 50e6, 0, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent);
        (bool ok, uint16 code, address signer) = mandate.canExecuteIntent(intent, sig);
        assertTrue(ok); assertEq(code, 0); assertEq(signer, agent);
        vm.prank(relayer); uint256 rid = mandate.executeSpendIntent(intent, sig);
        IMandate.Receipt memory r = mandate.getReceipt(rid);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.ALLOW)); assertEq(r.agent, agent);
        assertEq(r.ref, bytes32("invoice-1")); assertEq(token.balanceOf(counterparty), 50e6);
        assertEq(mandate.intentNonces(agent), 1);
    }

    function test_intent_replayReverts() public {
        uint256 id = _create(_rules());
        IMandate.SpendIntent memory intent = _intent(id, 50e6, 0, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent); vm.prank(relayer); mandate.executeSpendIntent(intent, sig);
        (bool ok, uint16 code,) = mandate.canExecuteIntent(intent, sig); assertFalse(ok); assertEq(code, 19);
        vm.prank(relayer); vm.expectRevert("INTENT_USED"); mandate.executeSpendIntent(intent, sig);
    }

    function test_intent_expiredReverts() public {
        uint256 id = _create(_rules());
        IMandate.SpendIntent memory intent = _intent(id, 50e6, 0, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent); vm.warp(block.timestamp + 601);
        (bool ok, uint16 code,) = mandate.canExecuteIntent(intent, sig); assertFalse(ok); assertEq(code, 18);
        vm.prank(relayer); vm.expectRevert("INTENT_EXPIRED"); mandate.executeSpendIntent(intent, sig);
        assertEq(mandate.intentNonces(agent), 0);
    }

    function test_intent_wrongNonceReverts() public {
        uint256 id = _create(_rules());
        IMandate.SpendIntent memory intent = _intent(id, 50e6, 1, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent);
        vm.prank(relayer); vm.expectRevert("INTENT_USED"); mandate.executeSpendIntent(intent, sig);
    }

    function test_intent_unboundSignerReverts() public {
        uint256 id = _create(_rules());
        IMandate.SpendIntent memory intent = _intent(id, 50e6, 0, block.timestamp + 600);
        bytes memory sig = _sign(0xB0B, intent);
        (bool ok, uint16 code,) = mandate.canExecuteIntent(intent, sig); assertFalse(ok); assertEq(code, 13);
        vm.prank(relayer); vm.expectRevert("NOT_AGENT"); mandate.executeSpendIntent(intent, sig);
    }

    function test_intent_tamperedAmountReverts() public {
        uint256 id = _create(_rules());
        IMandate.SpendIntent memory intent = _intent(id, 50e6, 0, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent); intent.amount = 99e6;
        vm.prank(relayer); vm.expectRevert("NOT_AGENT"); mandate.executeSpendIntent(intent, sig);
    }

    function test_intent_refusalWritesReceipt() public {
        uint256 id = _create(_rules());
        IMandate.SpendIntent memory intent = _intent(id, 150e6, 0, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent); vm.prank(relayer);
        uint256 rid = mandate.executeSpendIntent(intent, sig);
        IMandate.Receipt memory r = mandate.getReceipt(rid);
        assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE)); assertEq(r.reasonCode, 2);
        assertEq(mandate.intentNonces(agent), 1);
    }

    function test_intent_heartbeatApplies() public {
        uint256 id = _create(_rules()); vm.prank(owner); mandate.setHeartbeatPolicy(id, 3600);
        IMandate.SpendIntent memory intent = _intent(id, 50e6, 0, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent); vm.prank(relayer);
        uint256 rid = mandate.executeSpendIntent(intent, sig); assertEq(mandate.getReceipt(rid).reasonCode, 17);
    }

    function testFuzz_hardLawNeverPaysException(uint256 amount) public {
        uint256 id = _create(_rules()); amount = bound(amount, 1, 2000e6);
        IMandate.Receipt memory r = _pay(id, amount, COMPUTE);
        assertTrue(r.decision != IMandate.Decision.EXCEPTION);
        if (amount > 100e6) assertEq(uint8(r.decision), uint8(IMandate.Decision.REFUSE));
        vm.prank(agent); vm.expectRevert("HARD_LAW");
        mandate.requestException(id, amount, counterparty, COMPUTE, "try");
    }

    function testFuzz_denylistNeverPaid(uint256 amount) public {
        IMandate.Rules memory rules = _rules(); rules.exceptionMode = IMandate.ExceptionMode.GOVERNED;
        rules.exceptionApprovalThreshold = 1; uint256 id = _create(rules); amount = bound(amount, 1, 100e6);
        vm.startPrank(agent);
        uint256 rid = mandate.spend(id, amount, denylisted, COMPUTE, 0, 0);
        assertEq(mandate.getReceipt(rid).reasonCode, 5);
        assertEq(mandate.payWithEscrow(id, denylisted, amount, 0, 0, 3600), 0);
        vm.expectRevert("DENYLISTED_NO_EXCEPTION"); mandate.requestException(id, amount, denylisted, COMPUTE, "try");
        vm.stopPrank();
        IMandate.SpendIntent memory intent = IMandate.SpendIntent(id, amount, denylisted, COMPUTE, 0, 0, 0, block.timestamp + 600);
        bytes memory sig = _sign(AGENT_KEY, intent); vm.prank(relayer);
        rid = mandate.executeSpendIntent(intent, sig);
        assertEq(mandate.getReceipt(rid).reasonCode, 5); assertEq(token.balanceOf(denylisted), 0);
    }
}
