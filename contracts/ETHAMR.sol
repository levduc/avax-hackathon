pragma solidity ^0.5.17;

import "./AMR.sol";

contract ETHAMR is AMR {
  constructor(
    WVerifier _withdrawVerifier,
    RVerifier _rewardVerifier,
    uint256 _d_denomination,
    uint256 _r_denomination,
    uint32 _merkleTreeHeight,
    uint32 _blockCount,
    address _operator
  ) AMR(_withdrawVerifier, _rewardVerifier, _d_denomination, _r_denomination, _merkleTreeHeight, _blockCount, _operator) public {
  }

  function _processDeposit() internal {
    require(msg.value == d_denomination, "Please send `mixDenomination` ETH along with transaction");
  }

  function _processWithdraw(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) internal {
    // sanity checks
    require(msg.value == 0, "Message value is supposed to be zero for ETH instance");
    require(_refund == 0, "Refund value is supposed to be zero for ETH instance");

    (bool success, ) = _recipient.call.value(d_denomination - _fee)("");
    require(success, "payment to _recipient did not go thru");
    if (_fee > 0) {
      (success, ) = _relayer.call.value(_fee)("");
      require(success, "payment to _relayer did not go thru");
    }
  }

  function _processReward(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _reward) internal {
    // sanity checks
    require(msg.value == 0, "Message value is supposed to be zero for ETH instance");
    require(_reward== 0, "Refund value is supposed to be zero for ETH instance");

    (bool success, ) = _recipient.call.value(r_denomination - _fee)("");
    require(success, "payment to _recipient did not go thru");
    if (_fee > 0) {
      (success, ) = _relayer.call.value(_fee)("");
      require(success, "payment to _relayer did not go thru");
    }
  }
}
