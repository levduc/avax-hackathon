/* global artifacts */
require('dotenv').config({ path: '../.env' })

const ETHAMR = artifacts.require('ETHAMR')
const withdrawVerifier = artifacts.require('withdrawVerifier')
const rewardVerifier = artifacts.require('rewardVerifier')
const hasherContract = artifacts.require('Hasher')
module.exports = function(deployer, network, accounts) {
  return deployer.then(async () => {
    const { MERKLE_TREE_HEIGHT, ETH_AMOUNT } = process.env
    const wVerifier= await withdrawVerifier.deployed()
    const rVerifier = await rewardVerifier.deployed()
    const hasherInstance = await hasherContract.deployed()
    await ETHAMR.link(hasherContract, hasherInstance.address)
    // await deployer.link(hasherContract, ETHAMR)
    const blockCount = 10
    const amr = await deployer.deploy(
        ETHAMR, 
        wVerifier.address,
        rVerifier.address, 
        ETH_AMOUNT,  // deposit amount 
        ETH_AMOUNT,  // reward amount 
        MERKLE_TREE_HEIGHT,
        blockCount, 
        accounts[0])
    console.log('AMR\'s address ', amr.address)
  })
}
