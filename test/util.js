const { contract } = global
let { web3 } = global
if (!contract || !web3) {
  console.error('Error: Run tests using truffle test')
  process.exit(1)
}
const Web3 = require('web3')
web3 = new Web3(web3.currentProvider)

global.Promise = require('bluebird')

const { toHex } = web3.utils

const NULL_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000'

function parseTxBytes (bytes) {
  // strip nulls off the end of the ascii translation
  return web3.utils.hexToString(bytes.valueOf()).replace(/\0/g, '')
}

module.exports = {
  web3,
  NULL_BYTES,
  parseTxBytes,
  toHex,
}
