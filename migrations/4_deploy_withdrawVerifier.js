const withdrawVerifier = artifacts.require('withdrawVerifier')
module.exports = function(deployer){
    deployer.deploy(withdrawVerifier)
}
