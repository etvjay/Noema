// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {NoemaRegistry} from "../src/NoemaRegistry.sol";

contract DeployNoemaRegistry is Script {
    function run() external returns (NoemaRegistry registry) {
        vm.startBroadcast();
        registry = new NoemaRegistry();
        vm.stopBroadcast();
    }
}
