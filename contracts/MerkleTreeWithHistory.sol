pragma solidity ^0.5.17;

library Hasher {
   function poseidon(uint256[] memory inputs) public pure returns (uint256 result);
}

contract MerkleTreeWithHistory {
  uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
  uint256 public constant ZERO_VALUE = 21663839004416932945382355908790599225266501822907911457504978515578255421292; // = keccak256("tornado") % FIELD_SIZE

  uint32 public levels;

  // the following variables are made public for easier testing and debugging and
  // are not supposed to be accessed in regular code
  bytes32[] public filledSubtrees;
  bytes32[] public zeros;
  uint32 public currentRootIndex = 0;
  uint32 public nextIndex = 0;
  uint32 public constant ROOT_HISTORY_SIZE = 100;
  bytes32[ROOT_HISTORY_SIZE] public roots;

  // this tree stores two roots
  bytes32 public rewardCurrentRoot;
  uint32 public rewardCurrentBlocknum;
  bytes32 public rewardNextRoot;
  uint32 public rewardNextBlocknum;


  // rewardRoot|--------blockcount-------|nextRewardRoot|----| 
  uint32 blockCount;

  event RewardUpdate(uint32 updateAtBlock); 

  constructor(uint32 _treeLevels, uint32 _blockCount) public {
    require(_treeLevels > 0, "_treeLevels should be greater than zero");
    require(_treeLevels < 32, "_treeLevels should be less than 32");
    levels = _treeLevels;

    // new
    blockCount= _blockCount; 

    bytes32 currentZero = bytes32(ZERO_VALUE);

    zeros.push(currentZero);

    filledSubtrees.push(currentZero);
    
    for (uint32 i = 1; i < levels; i++) {
      currentZero = hashLeftRight(currentZero, currentZero);
      zeros.push(currentZero);
      filledSubtrees.push(currentZero);
    }

    roots[0] = hashLeftRight(currentZero, currentZero);

    // new
    rewardCurrentRoot=roots[0];
    rewardCurrentBlocknum=uint32(block.number);

    rewardNextRoot=roots[0];
    rewardNextBlocknum=uint32(block.number);
  }
  // mimc
//function hashLeftRight(bytes32 _left, bytes32 _right) public pure returns (bytes32) {
//   require(uint256(_left) < FIELD_SIZE, "_left should be inside the field");
//   require(uint256(_right) < FIELD_SIZE, "_right should be inside the field");
//   uint256 R = uint256(_left);
//   uint256 C = 0;
//   (R, C) = Hasher.MiMCSponge(R, C);
//   R = addmod(R, uint256(_right), FIELD_SIZE);
//   (R, C) = Hasher.MiMCSponge(R, C);
//   return bytes32(R);
//}
  // poseidon
   function hashLeftRight(bytes32 _left, bytes32 _right) public pure returns (bytes32) {
     uint256[] memory inputs = new uint256[](2);
     inputs[0] = uint256(_left);
     inputs[1] = uint256(_right);
     uint256 output = Hasher.poseidon(inputs);
     return bytes32(output);
   }
  function _insert(bytes32 _leaf) internal returns(uint32 index) {
    uint32 currentIndex = nextIndex;
    require(currentIndex != uint32(2)**levels, "Merkle tree is full. No more leafs can be added");
    nextIndex += 1;
    bytes32 currentLevelHash = _leaf;
    bytes32 left;
    bytes32 right;

    for (uint32 i = 0; i < levels; i++) {
      if (currentIndex % 2 == 0) {
        left = currentLevelHash;
        right = zeros[i];

        filledSubtrees[i] = currentLevelHash;
      } else {
        left = filledSubtrees[i];
        right = currentLevelHash;
      }

      currentLevelHash = hashLeftRight(left, right);

      currentIndex /= 2;
    }

    currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
    roots[currentRootIndex] = currentLevelHash;

    // [New] update roots
    if ((uint32(block.number) - rewardNextBlocknum) >= blockCount) 
    {
        rewardCurrentRoot = rewardNextRoot;
        rewardNextRoot = currentLevelHash;    
        rewardCurrentBlocknum = rewardNextBlocknum;
        rewardNextBlocknum = uint32(block.number);
        emit RewardUpdate(rewardCurrentBlocknum);
    }

    return nextIndex - 1;
  }

  /**
    @dev Whether the root is present in the root history
  */
  function isKnownRoot(bytes32 _root) public view returns(bool) {
    if (_root == 0) {
      return false;
    }
    uint32 i = currentRootIndex;
    do {
      if (_root == roots[i]) {
        return true;
      }
      if (i == 0) {
        i = ROOT_HISTORY_SIZE;
      }
      i--;
    } while (i != currentRootIndex);
    return false;
  }

  // 
  function isRewardRoot(bytes32 _rroot) public view returns(bool)
  {
      if (_rroot == 0) {
          return false;
      }
      if (_rroot == rewardCurrentRoot) {
          return true;
      }
      return false;
  }

  /**
    @dev Returns the last root
  */
  function getLastRoot() public view returns(bytes32) {
    return roots[currentRootIndex];
  }
}
