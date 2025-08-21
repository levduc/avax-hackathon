const circomlib = require('circomlib')
const poseidonHash = circomlib.poseidon.createHash(3,8,57)
const snarkjs = require('snarkjs')
const bigInt = snarkjs.bigInt

class poseidonHasher {
  hash(level, left, right) {
    // console.log("[+] computing poseidon hash")
    return poseidonHash([bigInt(left), bigInt(right)]).toString()
  }
}
module.exports = poseidonHasher
