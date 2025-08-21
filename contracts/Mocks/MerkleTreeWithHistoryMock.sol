pragma solidity 0.5.17;

import '../MerkleTreeWithHistory.sol';

contract MerkleTreeWithHistoryMock is MerkleTreeWithHistory {

  constructor (uint32 _treeLevels, uint32 _blockCount) MerkleTreeWithHistory(_treeLevels, _blockCount) public {}

  function insert(bytes32 _leaf) public {
      _insert(_leaf);
  }
}
