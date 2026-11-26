// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MandateFactory} from "../src/MandateFactory.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        MandateFactory factory = new MandateFactory();

        vm.stopBroadcast();

        console.log("MandateFactory:", address(factory));
        console.log("Mandate:       ", address(factory.mandate()));
    }
}
