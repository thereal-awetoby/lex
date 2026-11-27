// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Mandate} from "./Mandate.sol";

/// @title MandateFactory
/// @notice Deploys one Mandate contract. Owners create mandates on it directly.
contract MandateFactory {
    Mandate public immutable mandate;

    event LexDeployed(address mandateContract);

    constructor() {
        mandate = new Mandate();
        emit LexDeployed(address(mandate));
    }

    function getMandateContract() external view returns (address) {
        return address(mandate);
    }
}
