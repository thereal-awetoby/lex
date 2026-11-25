// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Mandate} from "./Mandate.sol";
import {IMandate} from "./interfaces/IMandate.sol";

/// @title MandateFactory
/// @notice Deploys and indexes Mandate instances.
///         The factory itself is stateless — each Mandate holds its own state.
///         We use a single Mandate contract with mandate IDs rather than
///         deploying separate contracts per mandate, keeping gas low.
contract MandateFactory {
    Mandate public immutable mandate;

    event LexDeployed(address mandateContract);

    constructor() {
        mandate = new Mandate();
        emit LexDeployed(address(mandate));
    }

    /// @notice Convenience: create a mandate through the factory
    function createMandate(
        IMandate.Rules calldata rules,
        address token,
        address[] calldata initialAgents,
        address[] calldata initialAllowlist,
        address[] calldata initialDenylist,
        address[] calldata initialApprovers
    ) external returns (uint256 mandateId) {
        // Factory calls on behalf of msg.sender — but Mandate.createMandate
        // sets owner = msg.sender (the factory). So we expose the Mandate
        // address and callers create directly for proper ownership.
        // This function is here for discoverability / indexing.
        // In practice, users call mandate.createMandate() directly.
        revert("CALL_MANDATE_DIRECTLY");
    }

    function getMandateContract() external view returns (address) {
        return address(mandate);
    }
}
