
const NULL_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000'

function parseTxBytes(bytes) {
  // strip nulls off the end of the ascii translation
  return web3.toAscii(bytes.valueOf()).replace(/\0/g, '');
}

module.exports = {
  NULL_BYTES,
  parseTxBytes,
};
