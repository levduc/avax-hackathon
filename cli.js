#!/usr/bin/env node
// Temporary demo client
// Works both in browser and node.js
require('dotenv').config()
const fs = require('fs')
const axios = require('axios')
const assert = require('assert')
const snarkjs = require('snarkjs')
const crypto = require('crypto')
const circomlib = require('circomlib')
const bigInt = snarkjs.bigInt
const merkleTree = require('./lib/MerkleTree')
const Web3 = require('web3')
const buildGroth16 = require('websnark/src/groth16')
const websnarkUtils = require('websnark/src/utils')
const { toWei, fromWei, toBN, BN } = require('web3-utils')
const config = require('./config')
const program = require('commander')

let web3, amr, circuit, reward_circuit, proving_key, reward_proving_key, groth16, erc20, senderAccount, netId
let MERKLE_TREE_HEIGHT, ETH_AMOUNT, TOKEN_AMOUNT, PRIVATE_KEY

/** Whether we are in a browser or node.js */
const inBrowser = (typeof window !== 'undefined')
let isLocalRPC = false 

/** Generate random number of specified byte length */
const rbigint = nbytes => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))

/** Compute pedersen hash */
const pedersenHash = data => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

/** BigNumber to hex string of specified length */
function toHex(number, length = 32) {
  const str = number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)
  return '0x' + str.padStart(length * 2, '0')
}

/** Display ETH account balance */
async function printETHBalance({ address, name }) {
  console.log(`[+] ${name} ETH balance is`, web3.utils.fromWei(await web3.eth.getBalance(address)))
}

/** Display ERC20 account balance */
async function printERC20Balance({ address, name, tokenAddress }) {
  const erc20ContractJson = require('./build/contracts/ERC20Mock.json')
  erc20 = tokenAddress ? new web3.eth.Contract(erc20ContractJson.abi, tokenAddress) : erc20
  console.log(`${name} Token Balance is`, web3.utils.fromWei(await erc20.methods.balanceOf(address).call()))
}

/**
 * Create deposit object from secret and 2 nullifiers
 */
function createDeposit({ withdrawNullifier, rewardNullifier, secret }) {
  const deposit = {withdrawNullifier, rewardNullifier, secret }
  // AMR create deposit will have three elements now 
  deposit.preimage = Buffer.concat([deposit.withdrawNullifier.leInt2Buff(31),
      deposit.rewardNullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)]) // 248 bytes why?
  deposit.commitment = pedersenHash(deposit.preimage)
  deposit.commitmentHex = toHex(deposit.commitment)
  deposit.withdrawNullifierHash = pedersenHash(deposit.withdrawNullifier.leInt2Buff(31))
  deposit.withdrawNullifierHex = toHex(deposit.withdrawNullifierHash)
  deposit.rewardNullifierHash = pedersenHash(deposit.rewardNullifier.leInt2Buff(31))
  deposit.rewardNullifierHex = toHex(deposit.rewardNullifierHash)
  return deposit
}

/**
 * Make a deposit
 * @param currency Сurrency
 * @param amount Deposit amount
 */
async function deposit({ currency, amount }) {
  // AMR
  const deposit = createDeposit({ withdrawNullifier: rbigint(31), rewardNullifier: rbigint(31),  secret: rbigint(31) })
  
  const note = toHex(deposit.preimage, 93) // 3 things now
  const noteString = `AMR-${currency}-${amount}-${netId}-${note}`
  console.log(`[+] Your note: ${noteString}`)
  if (currency === 'eth') {
    await printETHBalance({ address: amr._address, name: 'AMR' })
    await printETHBalance({ address: senderAccount, name: 'Sender account' })
    const value = isLocalRPC ? ETH_AMOUNT : fromDecimals({ amount, decimals: 18 })
    console.log('[+] Submitting deposit transaction')
    console.log(toHex(deposit.commitment))
    await amr.methods.deposit(toHex(deposit.commitment)).send({ value, from: senderAccount, gas: 2e6 }) // value = ? 

    await printETHBalance({ address: amr._address, name: 'AMR' })
    await printETHBalance({ address: senderAccount, name: 'Sender account' })
  } else { // a token
    await printERC20Balance({ address: amr._address, name: 'AMRERC20' })
    await printERC20Balance({ address: senderAccount, name: 'Sender account' })
    const decimals = isLocalRPC ? 18 : config.deployments[`netId${netId}`][currency].decimals
    const tokenAmount = isLocalRPC ? TOKEN_AMOUNT : fromDecimals({ amount, decimals })
    // 
    if (isLocalRPC) {
      console.log('Minting some test tokens to deposit')
      await erc20.methods.mint(senderAccount, tokenAmount).send({ from: senderAccount, gas: 2e6 })
    }

    const allowance = await erc20.methods.allowance(senderAccount, amr._address).call({ from: senderAccount })
    console.log('Current allowance is', fromWei(allowance))
    if (toBN(allowance).lt(toBN(tokenAmount))) {
      console.log('Approving tokens for deposit')
      await erc20.methods.approve(amr._address, tokenAmount).send({ from: senderAccount, gas: 1e6 })
    }

    console.log('Submitting deposit transaction')
    await amr.methods.deposit(toHex(deposit.commitment)).send({ from: senderAccount, gas: 2e6 })
    await printERC20Balance({ address: amr._address, name: 'AMRERC20' })
    await printERC20Balance({ address: senderAccount, name: 'Sender account' })
  }

  return noteString
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the amr, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param deposit Deposit object
 */

async function generateMerkleProof(deposit) {
  // Get all deposit events from smart contract and assemble merkle tree from them
  // Obtain even emit by the amr contract? 
  const events = await amr.getPastEvents('Deposit', { fromBlock: 0, toBlock: 'latest' }) 
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map(e => e.returnValues.commitment)
  const tree = new merkleTree(MERKLE_TREE_HEIGHT, leaves)
  // Find current commitment in the tree
  const depositEvent = events.find(e => e.returnValues.commitment === toHex(deposit.commitment))
  const leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1
  // Validate that our data is correct
  const root = await tree.root()
  const isValidRoot = await amr.methods.isKnownRoot(toHex(root)).call()
  // AMR TODO need two checks
  const isSpent = await amr.methods.isSpent(toHex(deposit.withdrawNullifierHash)).call()
  assert(isValidRoot === true, 'Merkle tree is corrupted')
  assert(isSpent === false, 'The withdraw note is already spent')
  assert(leafIndex >= 0, 'The deposit is not found in the tree')

  // Compute merkle proof of our commitment
  return tree.path(leafIndex)
}

// Reward Merkle
async function generateRewardMerkleProof(deposit) {
  // get all deposit before certain the current reward root 
  // Obtain even emit by the amr contract? 
  const reward_events = await amr.getPastEvents('RewardUpdate', { fromBlock: 0, toBlock: 'latest' }) 
  var currentRewardBlock = parseInt(reward_events[reward_events.length-1].returnValues.updateAtBlock, 10);

  const events = await amr.getPastEvents('Deposit', { fromBlock: 0, toBlock: currentRewardBlock }) 
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map(e => e.returnValues.commitment)
  const tree = new merkleTree(MERKLE_TREE_HEIGHT, leaves)
  // Find current commitment in the tree
  const depositEvent = events.find(e => e.returnValues.commitment === toHex(deposit.commitment))
  const leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1

  // Validate that our data is correct
  const root = await tree.root()
  const isValidRewardRoot = await amr.methods.isRewardRoot(toHex(root)).call()
  const isRedeem = await amr.methods.isRedeem(toHex(deposit.rewardNullifierHash)).call()
  assert(isValidRewardRoot === true, 'Merkle tree is corrupted')
  assert(isRedeem === false, 'The redeem note is already spent')
  assert(leafIndex >= 0, 'The deposit is not found in the tree')
  // Compute merkle proof of our commitment
  return tree.path(leafIndex)
}


// async function generateTwoMerkleProofs(deposit1, deposit2) {
//   // Get all deposit events from smart contract and assemble merkle tree from them
//   console.log('Getting current state from amr contract')
// 
//   const events = await amr.getPastEvents('Deposit', { fromBlock: 0, toBlock: 'latest' }) // obtain even emit by the amr contract? 
// 
//   const leaves = events
//     .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
//     .map(e => e.returnValues.commitment)
//   const tree = new merkleTree(MERKLE_TREE_HEIGHT, leaves)
// 
//   // Find current commitment 1 in the tree
//   const depositEvent1 = events.find(e => e.returnValues.commitment === toHex(deposit1.commitment))
//   const leafIndex1 = depositEvent1 ? depositEvent.returnValues.leafIndex : -1
//     
//   // Find current commitment 2 in the tree
//   const depositEvent2 = events.find(e => e.returnValues.commitment === toHex(deposit2.commitment))
//   const leafIndex2 = depositEvent2 ? depositEvent2.returnValues.leafIndex : -1
//   // Validate that our data is correct
//   const root = await tree.root()
//   const isValidRoot = await amr.methods.isKnownRoot(toHex(root)).call()
//   const isSpent1 = await amr.methods.isSpent(toHex(deposit1.nullifierHash)).call()
//   const isSpent2 = await amr.methods.isSpent(toHex(deposit2.nullifierHash)).call()
// 
//   assert(isValidRoot === true, '[-] Merkle tree is corrupted')
//   assert(isSpent1 === false, '[-] The note is already spent')
//   assert(isSpent2 === false, '[-] The note is already spent')
//   assert(leafIndex1 >= 0, '[-] The deposit is not found in the tree')
//   assert(leafIndex2 >= 0, '[-] The deposit is not found in the tree')
// 
//   // Compute merkle proof of our commitment
//   return [tree.path(leafIndex1), tree.path(leafIndex2)]
// }

/**
 * Generate SNARK proof for withdrawal
 * @param deposit Deposit object
 * @param recipient Funds recipient
 * @param relayer Relayer address
 * @param fee Relayer fee
 * @param refund Receive ether for exchanged tokens
 */
//

// single deposit input
async function generateWithdrawProof({ deposit, recipient, relayerAddress = 0, fee = 0, refund = 0 }) {
  // Compute merkle proof of our commitment
  const { root, path_elements, path_index } = await generateMerkleProof(deposit)
  // const { root, path_elements, path_index } = await generateMerkleProof(deposit)
  // Prepare circuit input
  const input = {
    // Public snark inputs
    root: root,
    w_nullifierHash_0: deposit.withdrawNullifierHash,
    r_nullifierHash_1: deposit.rewardNullifierHash,
    recipient: bigInt(recipient),
    relayer: bigInt(relayerAddress),
    fee: bigInt(fee),
    refund: bigInt(refund),
    // Private snark inputs
    w_nullifier_0: deposit.withdrawNullifier,
    r_nullifier_0: deposit.rewardNullifier,
    secret_0: deposit.secret,
    w_nullifier_1: deposit.withdrawNullifier,
    r_nullifier_1: deposit.rewardNullifier,
    secret_1: deposit.secret,
    w_pathElements: path_elements,
    w_pathIndices: path_index,
    r_pathElements: path_elements,
    r_pathIndices: path_index,
  }

  console.log('[+] Generating withdraw SNARK proof')
  console.time('Proof time')
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
  // const proofData = await snarkjs.groth16.fullProve(input, circuit, proving_key)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  console.timeEnd('Proof time')
  const args = [
    toHex(input.root),
    toHex(input.w_nullifierHash_0),
    toHex(input.r_nullifierHash_1),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund)
  ]
  return { proof, args }
}


async function generateRewardProof({ deposit, recipient, relayerAddress = 0, fee = 0, refund = 0 }) {
  // Compute merkle proof of our commitment
  const { root, path_elements, path_index } = await generateRewardMerkleProof(deposit)
  // const { root, path_elements, path_index } = await generateMerkleProof(deposit)
  // Prepare circuit input
  const input = {
    // Public snark inputs
    root: root,
    r_nullifierHash: deposit.rewardNullifierHash,
    recipient: bigInt(recipient),
    relayer: bigInt(relayerAddress),
    fee: bigInt(fee),
    refund: bigInt(refund),

    // Private snark inputs
    w_nullifierHash: deposit.withdrawNullifierHash,
    w_nullifier: deposit.withdrawNullifier,
    r_nullifier: deposit.rewardNullifier,
    secret: deposit.secret,
    pathElements: path_elements,
    pathIndices: path_index,
  }

  console.log('[+] Generating reward SNARK proof')
  console.time('Reward Proof time')
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, reward_circuit, reward_proving_key)
  // const proofData = await snarkjs.groth16.fullProve(input, circuit, proving_key)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  console.timeEnd('Reward Proof time')
  const args = [
    toHex(input.root),
    toHex(input.r_nullifierHash),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund)
  ]
  return { proof, args }
}


/**
 * Do an ETH withdrawal
 * @param noteString Note to withdraw
 * @param recipient Recipient address
 */
async function withdraw({ deposit, currency, amount, recipient, relayerURL, refund = '0' }) {
  if (currency === 'eth' && refund !== '0') {
    throw new Error('The ETH purchase is supposted to be 0 for ETH withdrawals')
  }
  refund = toWei(refund)
  if (relayerURL) 
  {
    if (relayerURL.endsWith('.eth')) {
      throw new Error('ENS name resolving is not supported. Please provide DNS name of the relayer. See instuctions in README.md')
    }
    const relayerStatus = await axios.get(relayerURL + '/status')
    const { relayerAddress, netId, gasPrices, ethPrices, relayerServiceFee } = relayerStatus.data
    assert(netId === await web3.eth.net.getId() || netId === '*', 'This relay is for different network')
    console.log('Relay address: ', relayerAddress)

    const decimals = isLocalRPC ? 18 : config.deployments[`netId${netId}`][currency].decimals
    const fee = calculateFee({ gasPrices, currency, amount, refund, ethPrices, relayerServiceFee, decimals })
    if (fee.gt(fromDecimals({ amount, decimals }))) {
      throw new Error('Too high refund')
    }
    const { proof, args } = await generateWithdrawProof({ deposit, recipient, relayerAddress, fee, refund })

    console.log('Sending withdraw transaction through relay')
    try {
      const relay = await axios.post(relayerURL + '/relay', { contract: amr._address, proof, args })
      if (netId === 1 || netId === 42) {
        console.log(`Transaction submitted through the relay. View transaction on etherscan https://${getCurrentNetworkName()}etherscan.io/tx/${relay.data.txHash}`)
      } else {
        console.log(`Transaction submitted through the relay. The transaction hash is ${relay.data.txHash}`)
      }

      const receipt = await waitForTxReceipt({ txHash: relay.data.txHash })
      console.log('Transaction mined in block', receipt.blockNumber)
    } catch (e) {
      if (e.response) {
        console.error(e.response.data.error)
      } else {
        console.error(e.message)
      }
    }
  } else { // using private key
    const { proof, args } = await generateWithdrawProof({ deposit, recipient, refund })
    console.log('Submitting withdraw transaction')
    await amr.methods.withdraw(proof, ...args).send({ from: senderAccount, value: refund.toString(), gas: 1e6 })
      .on('transactionHash', function (txHash) {
        if (netId === 1 || netId === 42) {
          console.log(`View transaction on etherscan https://${getCurrentNetworkName()}etherscan.io/tx/${txHash}`)
        } else {
          console.log(`The transaction hash is ${txHash}`)
        }
      }).on('error', function (e) {
        console.error('on transactionHash error', e.message)
      })
  }
  console.log('Done')
}

async function redeem({ deposit, currency, amount, recipient, relayerURL, refund = '0' }) {
  if (currency === 'eth' && refund !== '0') {
    throw new Error('The ETH purchase is supposted to be 0 for ETH withdrawals')
  }
  refund = toWei(refund)
  if (relayerURL) 
  {
    if (relayerURL.endsWith('.eth')) {
      throw new Error('ENS name resolving is not supported. Please provide DNS name of the relayer. See instuctions in README.md')
    }
    const relayerStatus = await axios.get(relayerURL + '/status')
    const { relayerAddress, netId, gasPrices, ethPrices, relayerServiceFee } = relayerStatus.data
    assert(netId === await web3.eth.net.getId() || netId === '*', 'This relay is for different network')
    console.log('Relay address: ', relayerAddress)

    const decimals = isLocalRPC ? 18 : config.deployments[`netId${netId}`][currency].decimals
    const fee = calculateFee({ gasPrices, currency, amount, refund, ethPrices, relayerServiceFee, decimals })
    if (fee.gt(fromDecimals({ amount, decimals }))) {
      throw new Error('Too high refund')
    }
    const { proof, args } = await generateRewardProof({ deposit, recipient, relayerAddress, fee, refund })

    console.log('Sending withdraw transaction through relay')
    try {
      const relay = await axios.post(relayerURL + '/relay', { contract: amr._address, proof, args })
      if (netId === 1 || netId === 42) {
        console.log(`Transaction submitted through the relay. View transaction on etherscan https://${getCurrentNetworkName()}etherscan.io/tx/${relay.data.txHash}`)
      } else {
        console.log(`Transaction submitted through the relay. The transaction hash is ${relay.data.txHash}`)
      }

      const receipt = await waitForTxReceipt({ txHash: relay.data.txHash })
      console.log('Transaction mined in block', receipt.blockNumber)
    } catch (e) {
      if (e.response) {
        console.error(e.response.data.error)
      } else {
        console.error(e.message)
      }
    }
  } else { // using private key
    console.log('[+] About to generate reward proof')
    const { proof, args } = await generateRewardProof({ deposit, recipient, refund })
    console.log('[+] Submitting Redeem transaction')
    await amr.methods.reward(proof, ...args).send({ from: senderAccount, value: refund.toString(), gas: 1e6 })
      .on('transactionHash', function (txHash) {
        if (netId === 1 || netId === 42) {
          console.log(`View transaction on etherscan https://${getCurrentNetworkName()}etherscan.io/tx/${txHash}`)
        } else {
          console.log(`The transaction hash is ${txHash}`)
        }
      }).on('error', function (e) {
        console.error('on transactionHash error', e.message)
      })
  }
  console.log('Done')
}
function fromDecimals({ amount, decimals }) {
  amount = amount.toString()
  let ether = amount.toString()
  const base = new BN('10').pow(new BN(decimals))
  const baseLength = base.toString(10).length - 1 || 1

  const negative = ether.substring(0, 1) === '-'
  if (negative) {
    ether = ether.substring(1)
  }

  if (ether === '.') {
    throw new Error('[ethjs-unit] while converting number ' + amount + ' to wei, invalid value')
  }

  // Split it into a whole and fractional part
  const comps = ether.split('.')
  if (comps.length > 2) {
    throw new Error(
      '[ethjs-unit] while converting number ' + amount + ' to wei,  too many decimal points'
    )
  }

  let whole = comps[0]
  let fraction = comps[1]

  if (!whole) {
    whole = '0'
  }
  if (!fraction) {
    fraction = '0'
  }
  if (fraction.length > baseLength) {
    throw new Error(
      '[ethjs-unit] while converting number ' + amount + ' to wei, too many decimal places'
    )
  }

  while (fraction.length < baseLength) {
    fraction += '0'
  }

  whole = new BN(whole)
  fraction = new BN(fraction)
  let wei = whole.mul(base).add(fraction)

  if (negative) {
    wei = wei.mul(negative)
  }

  return new BN(wei.toString(10), 10)
}

function toDecimals(value, decimals, fixed) {
  const zero = new BN(0)
  const negative1 = new BN(-1)
  decimals = decimals || 18
  fixed = fixed || 7

  value = new BN(value)
  const negative = value.lt(zero)
  const base = new BN('10').pow(new BN(decimals))
  const baseLength = base.toString(10).length - 1 || 1

  if (negative) {
    value = value.mul(negative1)
  }

  let fraction = value.mod(base).toString(10)
  while (fraction.length < baseLength) {
    fraction = `0${fraction}`
  }
  fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1]

  const whole = value.div(base).toString(10)
  value = `${whole}${fraction === '0' ? '' : `.${fraction}`}`

  if (negative) {
    value = `-${value}`
  }

  if (fixed) {
    value = value.slice(0, fixed)
  }

  return value
}

function getCurrentNetworkName() {
  switch (netId) {
  case 1:
    return ''
  case 42:
    return 'kovan.'
  }

}

function calculateFee({ gasPrices, currency, amount, refund, ethPrices, relayerServiceFee, decimals }) {
  const decimalsPoint = Math.floor(relayerServiceFee) === Number(relayerServiceFee) ?
    0 :
    relayerServiceFee.toString().split('.')[1].length
  const roundDecimal = 10 ** decimalsPoint
  const total = toBN(fromDecimals({ amount, decimals }))
  const feePercent = total.mul(toBN(relayerServiceFee * roundDecimal)).div(toBN(roundDecimal * 100))
  const expense = toBN(toWei(gasPrices.fast.toString(), 'gwei')).mul(toBN(5e5))
  let desiredFee
  switch (currency) {
  case 'eth': {
    desiredFee = expense.add(feePercent)
    break
  }
  default: {
    desiredFee = expense.add(toBN(refund))
      .mul(toBN(10 ** decimals))
      .div(toBN(ethPrices[currency]))
    desiredFee = desiredFee.add(feePercent)
    break
  }
  }
  return desiredFee
}

/**
 * Waits for transaction to be mined
 * @param txHash Hash of transaction
 * @param attempts
 * @param delay
 */
function waitForTxReceipt({ txHash, attempts = 60, delay = 1000 }) {
  return new Promise((resolve, reject) => {
    const checkForTx = async (txHash, retryAttempt = 0) => {
      const result = await web3.eth.getTransactionReceipt(txHash)
      if (!result || !result.blockNumber) {
        if (retryAttempt <= attempts) {
          setTimeout(() => checkForTx(txHash, retryAttempt + 1), delay)
        } else {
          reject(new Error('tx was not mined'))
        }
      } else {
        resolve(result)
      }
    }
    checkForTx(txHash)
  })
}

/**
 * @param noteString the note
 */
function parseNote(noteString) {
  // 124 --> 186 for AMR
  // const noteRegex = /AMR-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g
  const noteRegex = /AMR-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{186})/g
  const match = noteRegex.exec(noteString)
  if (!match) {
    throw new Error('The note has invalid format')
  }

  const buf = Buffer.from(match.groups.note, 'hex')

  const withdrawNullifier = bigInt.leBuff2int(buf.slice(0, 31))
  const rewardNullifier = bigInt.leBuff2int(buf.slice(31, 62))
  const secret = bigInt.leBuff2int(buf.slice(62, 93))

  const deposit = createDeposit({ withdrawNullifier, rewardNullifier, secret })
  console.log('[+] Parse Note:', toHex(deposit.commitment))

  const netId = Number(match.groups.netId)

  return { currency: match.groups.currency, amount: match.groups.amount, netId, deposit }
}

async function loadDepositData({ deposit }) {
  try {
    const eventWhenHappened = await amr.getPastEvents('Deposit', {
      filter: {
        commitment: deposit.commitmentHex
      },
      fromBlock: 0,
      toBlock: 'latest'
    })
    if (eventWhenHappened.length === 0) {
      throw new Error('There is no related deposit, the note is invalid')
    }

    const { timestamp } = eventWhenHappened[0].returnValues
    const txHash = eventWhenHappened[0].transactionHash
    const isSpent = await amr.methods.isSpent(deposit.nullifierHex).call()
    const receipt = await web3.eth.getTransactionReceipt(txHash)
    return { timestamp, txHash, isSpent, from: receipt.from, commitment: deposit.commitmentHex }
  } catch (e) {
    console.error('loadDepositData', e)
  }
  return {}
}
async function loadWithdrawalData({ amount, currency, deposit }) {
  try {
    const events = await await amr.getPastEvents('Withdrawal', {
      fromBlock: 0,
      toBlock: 'latest'
    })

    const withdrawEvent = events.filter((event) => {
      return event.returnValues.nullifierHash === deposit.nullifierHex
    })[0]

    const fee = withdrawEvent.returnValues.fee
    const decimals = config.deployments[`netId${netId}`][currency].decimals
    const withdrawalAmount = toBN(fromDecimals({ amount, decimals })).sub(
      toBN(fee)
    )
    const { timestamp } = await web3.eth.getBlock(withdrawEvent.blockHash)
    return {
      amount: toDecimals(withdrawalAmount, decimals, 9),
      txHash: withdrawEvent.transactionHash,
      to: withdrawEvent.returnValues.to,
      timestamp,
      nullifier: deposit.nullifierHex,
      fee: toDecimals(fee, decimals, 9)
    }
  } catch (e) {
    console.error('loadWithdrawalData', e)
  }
}

/**
 * Init web3, contracts, and snark
 */
async function init({ rpc, noteNetId, currency = 'dai', amount = '100' }) {
  let contractJson, erc20ContractJson, erc20amrJson, amrAddress, tokenAddress
  // TODO do we need this? should it work in browser really?
  if (inBrowser) {
    // Initialize using injected web3 (Metamask)
    // To assemble web version run `npm run browserify`
    web3 = new Web3(window.web3.currentProvider, null, { transactionConfirmationBlocks: 1 })
    console.log("[+] Loading contract json")
    contractJson = await (await fetch('build/contracts/ETHAMR.json')).json()
    // circuit
    console.log("[+] Loading withraw and reward")
    circuit = await (await fetch('build/circuits/withdraw.json')).json()
    reward_circuit = await (await fetch('build/circuits/reward.json')).json()
    // amr
    console.log("[+] Loading WithdrawKeys")
    proving_key = await (await fetch('build/circuits/withdraw_proving_key.bin')).arrayBuffer()
    console.log("[+] Loading RewardKeys")
    reward_proving_key = await (await fetch('build/circuits/reward_proving_key.bin')).arrayBuffer()
    MERKLE_TREE_HEIGHT = 20
    ETH_AMOUNT = 1e17 // local rpc
    TOKEN_AMOUNT = 1e19
    senderAccount = (await web3.eth.getAccounts())[0]
    console.log(senderAccount)
  } else {
    // Initialize from local node
    web3 = new Web3(rpc, null, { transactionConfirmationBlocks: 1 })
    contractJson = require('./build/contracts/ETHAMR.json')
    circuit = require('./build/circuits/withdraw.json')
    proving_key = fs.readFileSync('build/circuits/withdraw_proving_key.bin').buffer
    // amr
    reward_circuit = require('./build/circuits/reward.json')
    reward_proving_key = fs.readFileSync('build/circuits/reward_proving_key.bin').buffer

    MERKLE_TREE_HEIGHT = process.env.MERKLE_TREE_HEIGHT || 20
    ETH_AMOUNT = process.env.ETH_AMOUNT
    TOKEN_AMOUNT = process.env.TOKEN_AMOUNT
    PRIVATE_KEY = process.env.PRIVATE_KEY
    if (PRIVATE_KEY) {
      const account = web3.eth.accounts.privateKeyToAccount('0x' + PRIVATE_KEY)
      web3.eth.accounts.wallet.add('0x' + PRIVATE_KEY)
      web3.eth.defaultAccount = account.address
      senderAccount = account.address
    } else {
      console.log('Warning! PRIVATE_KEY not found. Please provide PRIVATE_KEY in .env file if you deposit')
    }
    erc20ContractJson = require('./build/contracts/ERC20Mock.json')
    erc20amrJson = require('./build/contracts/ERC20AMR.json')
  }
  // groth16 initialises a lot of Promises that will never be resolved, that's why we need to use process.exit to terminate the CLI
  groth16 = await buildGroth16()
  netId = await web3.eth.net.getId()
  if (noteNetId && Number(noteNetId) !== netId) {
    throw new Error('This note is for a different network. Specify the --rpc option explicitly')
  }
  isLocalRPC = netId > 42

  if (isLocalRPC) {
    amrAddress = currency === 'eth' ? contractJson.networks[netId].address : erc20amrJson.networks[netId].address
    tokenAddress = currency !== 'eth' ? erc20ContractJson.networks[netId].address : null
    senderAccount = (await web3.eth.getAccounts())[0]
  } 
  else {
    try {
      console.log(netId)
      amrAddress = config.deployments[`netId${netId}`][currency].instanceAddress[amount]
      if (!amrAddress) {
        throw new Error()
      }
      tokenAddress = config.deployments[`netId${netId}`][currency].tokenAddress
    } catch (e) {
      console.error('There is no such amr instance, check the currency and amount you provide')
      process.exit(1)
    }
  }
  amr = new web3.eth.Contract(contractJson.abi, amrAddress)
  erc20 = currency !== 'eth' ? new web3.eth.Contract(erc20ContractJson.abi, tokenAddress) : {}
}


async function browserInit({ rpc, noteNetId, currency = 'dai', amount = '100' }) {
  let contractJson, erc20ContractJson, erc20amrJson, amrAddress, tokenAddress
  // Initialize using injected web3 (Metamask)
  // To assemble web version run `npm run browserify`
  web3 = new Web3(window.web3.currentProvider, null, { transactionConfirmationBlocks: 1 })
  console.log("[+] Loading contract")
  contractJson = await (await fetch('build/contracts/ETHAMR.json')).json()
  console.log("[+] Done loading contract")
  // circuit
  console.log("[+] Loading withraw and reward")
  circuit = await (await fetch('build/circuits/withdraw.json')).json()
  reward_circuit = await (await fetch('build/circuits/reward.json')).json()
  console.log("[+] Done")
  // amr
  console.log("[+] Loading WithdrawKeys")
  proving_key = await (await fetch('build/circuits/withdraw_proving_key.bin')).arrayBuffer()
  console.log("[+] Done")
  console.log("[+] Loading RewardKeys")
  reward_proving_key = await (await fetch('build/circuits/reward_proving_key.bin')).arrayBuffer()
  console.log("[+] Done")
  MERKLE_TREE_HEIGHT = 20
  ETH_AMOUNT = 1e18
  TOKEN_AMOUNT = 1e19
  senderAccount = (await web3.eth.getAccounts())[0]
  console.log(senderAccount)
  // groth16 initialises a lot of Promises that will never be resolved, that's why we need to use process.exit to terminate the CLI
  groth16 = await buildGroth16()
  netId = await web3.eth.net.getId()
  if (noteNetId && Number(noteNetId) !== netId) {
    throw new Error('This note is for a different network. Specify the --rpc option explicitly')
  }
  isLocalRPC = netId > 42
  if (isLocalRPC) {
    amrAddress = currency === 'eth' ? contractJson.networks[netId].address : erc20amrJson.networks[netId].address
    tokenAddress = currency !== 'eth' ? erc20ContractJson.networks[netId].address : null
    senderAccount = (await web3.eth.getAccounts())[0]
  } 
  else
  {
    try {
      amrAddress = config.deployments[`netId${netId}`][currency].instanceAddress[amount]
      if (!amrAddress) {
        throw new Error()
      }
    } catch (e) 
      {
      console.error('There is no such amr instance, check the currency and amount you provide')
      process.exit(1)
    }
  }
  amr = new web3.eth.Contract(contractJson.abi, amrAddress)
  erc20 = currency !== 'eth' ? new web3.eth.Contract(erc20ContractJson.abi, tokenAddress) : {}
}

async function main() {
    if(inBrowser){
        const instance = { currency: 'eth', amount: '0.1' }
        await init(instance)
        window.deposit = async () => {
          await deposit(instance)
        }
        window.withdraw = async () => {
          const noteString = prompt('Enter the note to withdraw')
          const recipient = (await web3.eth.getAccounts())[0]
          const { currency, amount, netId, deposit } = parseNote(noteString)
          await init({ noteNetId: netId, currency, amount })
          await withdraw({ deposit, currency, amount, recipient })
        }
        window.redeem = async() => {
          const noteString = prompt('Enter the note to redeem')
          const recipient = (await web3.eth.getAccounts())[0]
          const { currency, amount, netId, deposit } = parseNote(noteString)
          await init({ noteNetId: netId, currency, amount })
          await redeem({ deposit, currency, amount, recipient })
        }
    }
    else {
    program
      .option('-r, --rpc <URL>', 'The RPC, CLI should interact with', 'http://localhost:7545')
      .option('-R, --relayer <URL>', 'Withdraw via relayer')
    program
      .command('deposit <currency> <amount>')
      .description('Submit a deposit of specified currency and amount from default eth account and return the resulting note. The currency is one of (ETH). The amount depends on currency, see config.js file.')
      .action(async (currency, amount) => {
        currency = currency.toLowerCase()
        await init({ rpc: program.rpc, currency, amount })
        await deposit({ currency, amount })
      })
    program
      .command('withdraw <note> <recipient> [ETH_purchase]')
      .description('Withdraw a note to a recipient account using relayer or specified private key. You can exchange some of your deposit`s tokens to ETH during the withdrawal by specifing ETH_purchase (e.g. 0.01) to pay for gas in future transactions. Also see the --relayer option.')
      .action(async (noteString, recipient, refund) => {
        const { currency, amount, netId, deposit } = parseNote(noteString)
        await init({ rpc: program.rpc, noteNetId: netId, currency, amount })
        await withdraw({ deposit, currency, amount, recipient, refund, relayerURL: program.relayer })
      })
    program
      .command('balance <address> [token_address]')
      .description('Check ETH and ERC20 balance')
      .action(async (address, tokenAddress) => {
        await init({ rpc: program.rpc })
        await printETHBalance({ address, name: '' })
        if (tokenAddress) {
          await printERC20Balance({ address, name: '', tokenAddress })
        }
      })
    program
      .command('reward <note> <recipient> [ETH_purchase]')
      .description('Withdraw a note to a recipient account using relayer or specified private key. You can exchange some of your deposit`s tokens to ETH during the withdrawal by specifing ETH_purchase (e.g. 0.01) to pay for gas in future transactions. Also see the --relayer option.')
      .action(async (noteString, recipient, refund) => {
        const { currency, amount, netId, deposit } = parseNote(noteString)
        await init({ rpc: program.rpc, noteNetId: netId, currency, amount })
        await redeem({ deposit, currency, amount, recipient, refund, relayerURL: program.relayer })
      })
    program
      .command('test')
      .description('Perform an automated test. It deposits and withdraws one ETH and one ERC20 note. Uses ganache.')
      .action(async () => {
        console.log('Start performing ETH deposit-withdraw test')
        let currency = 'eth'
        let amount = '0.1'
        await init({ rpc: program.rpc, currency, amount })
        var i
        let redeemString
        let noteString 
        let withdrawThenRedeem
        for(i = 0; i < 30; i++){
            noteString = await deposit({ currency, amount })
            if(i == 0) {
                redeemString = noteString 
            }
            if(i == 1){
                withdrawThenRedeem = noteString // after 2*blockcounts+1 this become valid for reward
            }
        }
        let parsedNote = parseNote(noteString)
        try{
            console.log('[test] Attempt get reward on recent deposit')
            await redeem({ deposit: parsedNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })
        } catch(e){
            console.log('[test] Passed.')
        }

        console.log('[+] Redeem')
        let redeemNote = parseNote(redeemString)
        await redeem({ deposit: redeemNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })
        try{
            console.log('[test] Attempt to redeem twice')
            await redeem({ deposit: redeemNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })
        } catch(e){
            console.log('[test] Passed')
        }

        console.log('[+] Withdraw')
        await withdraw({ deposit: parsedNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })
        try{
            console.log('[test] Attempt to withdraw twice')
            await withdraw({ deposit: parsedNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })
        } catch(e){
            console.log('[test] Passed')
        }
        let withdrawThenRedeemNote = parseNote(withdrawThenRedeem)
        await withdraw({ deposit: withdrawThenRedeemNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })
        try{
            console.log('[test] Attempt to withdraw then redeem')
            await redeem({ deposit: withdrawThenRedeemNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })
        } catch(e){
            console.log('[test] Passed')
        }
      })
    try {
      await program.parseAsync(process.argv)
      process.exit(0)
    } catch (e) {
      console.log('Error:', e)
      process.exit(1)
    }
  }
}

main()
