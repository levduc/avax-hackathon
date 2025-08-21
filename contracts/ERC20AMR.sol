pragma solidity 0.5.17;
import "./AMR.sol";

contract ERC20AMR is AMR {
  address public token;

  constructor(
    WVerifier _withdrawVerifier,
    RVerifier _rewardVerifier,
    uint256 _d_denomination,
    uint256 _r_denomination,
    uint32 _merkleTreeHeight,
    uint32 _blockCount,
    address _operator,
    address _token
  ) AMR(_withdrawVerifier, _rewardVerifier, _d_denomination, _r_denomination, _merkleTreeHeight, _blockCount, _operator) public {
    token = _token;
  }

  function _processDeposit() internal {
    require(msg.value == 0, "ETH value is supposed to be 0 for ERC20 instance");
    _safeErc20TransferFrom(msg.sender, address(this), d_denomination); // equal to deposit
  }
  // can be used for reward as well 
  function _processWithdraw(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) internal {
    require(msg.value == _refund, "Incorrect refund amount received by the contract");

    _safeErc20Transfer(_recipient, d_denomination - _fee);
    if (_fee > 0) {
      _safeErc20Transfer(_relayer, _fee);
    }

    if (_refund > 0) {
      (bool success, ) = _recipient.call.value(_refund)("");
      if (!success) {
        // let's return _refund back to the relayer
        _relayer.transfer(_refund);
      }
    }
  }
  
  function _processReward(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _reward) internal {
    require(msg.value == _reward, "Incorrect refund amount received by the contract");
    _safeErc20Transfer(_recipient, r_denomination - _fee);
    if (_fee > 0) {
      _safeErc20Transfer(_relayer, _fee);
    }

    if (_reward> 0) {
      (bool success, ) = _recipient.call.value(_reward)("");
      if (!success) {
        // let's return _refund back to the relayer
        _relayer.transfer(_reward);
      }
    }
  }

  function _safeErc20TransferFrom(address _from, address _to, uint256 _amount) internal {
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd /* transferFrom */, _from, _to, _amount));
    require(success, "not enough allowed tokens");

    // if contract returns some data lets make sure that is `true` according to standard
    if (data.length > 0) {
      require(data.length == 32, "data length should be either 0 or 32 bytes");
      success = abi.decode(data, (bool));
      require(success, "not enough allowed tokens. Token returns false.");
    }
  }

  function _safeErc20Transfer(address _to, uint256 _amount) internal {
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb /* transfer */, _to, _amount));
    require(success, "not enough tokens");

    // if contract returns some data lets make sure that is `true` according to standard
    if (data.length > 0) {
      require(data.length == 32, "data length should be either 0 or 32 bytes");
      success = abi.decode(data, (bool));
      require(success, "not enough tokens. Token returns false.");
    }
  }
}
