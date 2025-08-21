pragma solidity ^0.5.17;

import "./MerkleTreeWithHistory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract WVerifier {
  function verifyProof(bytes memory _proof, uint256[7] memory _input) public returns(bool);
}

contract RVerifier {
  function verifyProof(bytes memory _proof, uint256[6] memory _input) public returns(bool);
}

contract AMR is MerkleTreeWithHistory, ReentrancyGuard {
  // Amount of deposit   
  uint256 public d_denomination;
  // Amount of reward
  uint256 public r_denomination;
  // Withdraw nullifier list
  mapping(bytes32 => bool) public nullifierHashes;
  // Reward nullifier list  
  mapping(bytes32 => bool) public rewardNullifierHashes;
  // Commitments 
  mapping(bytes32 => bool) public commitments;
  
  // withdraw Verifier
  WVerifier public withdrawVerifier;
  // reward verifier
  RVerifier public rewardVerifier;
  // operator can update snark verification key
  // after the final trusted setup ceremony operator rights are supposed to be transferred to zero address
  address public operator;
  modifier onlyOperator {
    require(msg.sender == operator, "Only operator can call this function.");
    _;
  }

  event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
  event Reward(address to, bytes32 rewardNullifierHash, address indexed relayer, uint256 fee);
  event Withdrawal(address to, bytes32 withdrawNullifierHash, bytes32 rewardNullifierHash, address indexed relayer, uint256 fee);

  /**
    @dev The constructor
    @param _withdrawVerifier the address of SNARK verifier for this contract
    @param _rewardVerifier the address of SNARK verifier for this contract
    @param _d_denomination transfer amount for each deposit
    @param _r_denomination transfer amount for each deposit
    @param _merkleTreeHeight the height of deposits Merkle Tree
    @param _operator operator address (see operator comment above)
  */
  constructor(
    WVerifier _withdrawVerifier,   // withdraw verifier
    RVerifier _rewardVerifier,     // reward verifier
    uint256 _d_denomination,
    uint256 _r_denomination,  // reward amount 
    uint32 _merkleTreeHeight,
    uint32 _blockCount,
    address _operator
  ) MerkleTreeWithHistory(_merkleTreeHeight, _blockCount) public {
    require(_d_denomination > 0, "Deposit denomination should be greater than 0");
    require(_r_denomination > 0, "Reward denomination should be greater than 0");
    withdrawVerifier = _withdrawVerifier;
    rewardVerifier = _rewardVerifier;   // adding reward verifier
    operator = _operator;
    d_denomination = _d_denomination;
    r_denomination = _r_denomination;
  }

  // Should be unchanged
  /**
    @dev Deposit funds into the contract. The caller must send (for ETH) or approve (for ERC20) value equal to or `denomination` of this instance.
    @param _commitment the note commitment, which is PedersenHash(nullifier + secret)
  */
  function deposit(bytes32 _commitment) external payable nonReentrant {

    require(!commitments[_commitment], "The commitment has been submitted");

    uint32 insertedIndex = _insert(_commitment);
    commitments[_commitment] = true;
    _processDeposit();

    emit Deposit(_commitment, insertedIndex, block.timestamp);
  }

  /** @dev this function is defined in a child contract */
  function _processDeposit() internal;

  /**
    @dev Withdraw a deposit from the contract. `proof` is a zkSNARK proof data, and input is an array of circuit public inputs
    `input` array consists of:
      - merkle root of all deposits in the contract
      - hash of unique deposit nullifier to prevent double spends
      - the recipient of funds
      - optional fee that goes to the transaction sender (usually a relay)
  */
  function withdraw(bytes calldata _proof, bytes32 _root, bytes32 _wdrHash, bytes32 _rwdHash, address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) external payable nonReentrant {

    require(_fee <= d_denomination, "Fee exceeds transfer value");
    require(!nullifierHashes[_wdrHash], "The withdraw note has been already spent for withdrawing");
    require(!nullifierHashes[_rwdHash], "The reward note has been already spent for withdrawing");
    require(isKnownRoot(_root), "Cannot find your merkle root"); // Make sure to use a recent one
    require(withdrawVerifier.verifyProof(_proof, [uint256(_root), uint256(_wdrHash), uint256(_rwdHash), uint256(_recipient), uint256(_relayer), _fee, _refund]), "Invalid withdraw proof");

    nullifierHashes[_wdrHash] = true;
    nullifierHashes[_rwdHash] = true;
    rewardNullifierHashes[_rwdHash] = true; // cannot obtain reward using this hash anymore

    _processWithdraw(_recipient, _relayer, _fee, _refund);

    emit Withdrawal(_recipient, _wdrHash, _rwdHash,  _relayer, _fee);
  }
  // @TODO
  function reward(bytes calldata _rproof, bytes32 _rroot, bytes32 _rwdHash, address payable _recipient, address payable _relayer, uint256 _fee, uint256 _reward) external payable nonReentrant 
  {
    require(_fee <= r_denomination, "Fee exceeds transfer value");
    require(!rewardNullifierHashes[_rwdHash], "The reward note has been already redeemed");
    // Wrong root
    require(isRewardRoot(_rroot), "Cannot find your merkle root"); // Make sure to use a recent one
    require(rewardVerifier.verifyProof(_rproof, [uint256(_rroot), uint256(_rwdHash), uint256(_recipient), uint256(_relayer), _fee, _reward]), "Invalid reward proof");

    rewardNullifierHashes[_rwdHash] = true; // cannot obtain reward using this hash anymore
    _processReward(_recipient, _relayer, _fee, _reward);
    emit Reward(_recipient, _rwdHash,  _relayer, _fee);
  }

  /** @dev this function is defined in a child contract */
  function _processWithdraw(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) internal;

  function _processReward(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _reward) internal;

  /** @dev whether a note is already spent */
  // TODO amr may need to verify two nullifier hash is needed
  function isSpent(bytes32 _wdrHash) public view returns(bool) {
    return nullifierHashes[_wdrHash];
  }

  function isRedeem(bytes32 _rwdHash) public view returns(bool) {
    return rewardNullifierHashes[_rwdHash];
  }

  /** @dev whether an array of notes is already spent */
  function isSpentArray(bytes32[] calldata _nullifierHashes) external view returns(bool[] memory spent) {
    spent = new bool[](_nullifierHashes.length);
    for(uint i = 0; i < _nullifierHashes.length; i++) {
      if (isSpent(_nullifierHashes[i])) {
        spent[i] = true;
      }
    }
  }


  /** @dev whether an array of notes is already spent */
  function isRedeemArray(bytes32[] calldata _nullifierHashes) external view returns(bool[] memory redeem) {
    redeem = new bool[](_nullifierHashes.length);
    for(uint i = 0; i < _nullifierHashes.length; i++) {
      if (isSpent(_nullifierHashes[i])) {
        redeem[i] = true;
      }
    }
  }

  /**
    @dev allow operator to update SNARK verification keys. This is needed to update keys after the final trusted setup ceremony is held.
    After that operator rights are supposed to be transferred to zero address
  */
  // update withdraw verifier
  function updateWithdrawVerifier(address _newVerifier) external onlyOperator {
    withdrawVerifier = WVerifier(_newVerifier);
  }

  // update reward verifier
  function updateRewardVerifier(address _newVerifier) external onlyOperator {
    rewardVerifier = RVerifier(_newVerifier);
  }

  /** @dev operator can change his address */
  function changeOperator(address _newOperator) external onlyOperator {
    operator = _newOperator;
  }
}
