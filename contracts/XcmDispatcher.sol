// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IXcm {
    struct Weight {
        uint64 refTime;
        uint64 proofSize;
    }

    function weighMessage(bytes calldata message) external view returns (Weight memory weight);
    function xcmExecute(bytes calldata message, Weight calldata weight) external;
    function xcmSend(bytes calldata destination, bytes calldata message) external;
}

contract XcmDispatcher is Ownable {
    IXcm public constant XCM_PRECOMPILE = IXcm(0x00000000000000000000000000000000000a0000);

    event XcmExecuted(bytes message, uint64 refTime, uint64 proofSize);
    event XcmSent(bytes destination, bytes message);

    constructor(address initialOwner) {
        _transferOwnership(initialOwner);
    }

    function previewWeight(bytes calldata message) external view returns (IXcm.Weight memory) {
        return XCM_PRECOMPILE.weighMessage(message);
    }

    function execute(bytes calldata message) external onlyOwner {
        IXcm.Weight memory weight = XCM_PRECOMPILE.weighMessage(message);
        XCM_PRECOMPILE.xcmExecute(message, weight);
        emit XcmExecuted(message, weight.refTime, weight.proofSize);
    }

    function send(bytes calldata destination, bytes calldata message) external onlyOwner {
        XCM_PRECOMPILE.xcmSend(destination, message);
        emit XcmSent(destination, message);
    }
}
