const rewardVerifier = artifacts.require('rewardVerifier')
module.exports = function(deployer){
    deployer.deploy(rewardVerifier)
}
