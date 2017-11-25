const ConditionalSubprovider = require('./conditional-subprovider.js');

const WALLET_METHODS = [
  'eth_coinbase',
  'eth_accounts',
  'eth_sendTransaction',
  'eth_sign',
  'personal_sign',
  'personal_ecRecover',
];

class DelegatedWalletSubprovider extends ConditionalSubprovider {
  constructor(subprovider) {
    super({
      subprovider,
      condition: (payload) => WALLET_METHODS.includes(payload.method),
    });
  }
}

module.exports = DelegatedWalletSubprovider;
