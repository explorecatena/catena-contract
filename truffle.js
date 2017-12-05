const ProviderEngine = require('web3-provider-engine');
const Web3Subprovider = require('web3-provider-engine/subproviders/web3.js');
const DelegatedWalletSubprovider = require('./lib/delegated-wallet-subprovider.js');
const { HttpProvider } = require('web3').providers;

const GWEI = 1000000000;

const defaults = {
  host: 'localhost',
  port: 8545,
  gas: 4500000,
  gasPrice: 5 * GWEI,
};

const testrpc = {
  ...defaults,
  port: 7545,
  network_id: '*',
};

const liveDeployGasPrice = 2 * GWEI;
const liveTxGasPrice = 0.5 * GWEI;

const liveProvider = () => {
  const engine = new ProviderEngine();

  // Localhost for wallet only
  engine.addProvider(new DelegatedWalletSubprovider(new Web3Subprovider(new HttpProvider('http://localhost:8645'))));

  // Public node for the rest
  engine.addProvider(new Web3Subprovider(new HttpProvider('https://web3.faa.st/eth')));

  engine.on('error', console.error);

  engine.start();
  return engine;
};

const live = {
  provider: liveProvider,
  network_id: '1',
  gasPrice: liveDeployGasPrice, // Truffle only uses this for deploys
  txGasPrice: liveTxGasPrice, // Custom prop for manual use in scripts
};

const ropsten = {
  ...defaults,
  network_id: '3',
};

const rinkeby = {
  ...defaults,
  network_id: '4',
};

module.exports = {
  networks: {
    live,
    ropsten,
    rinkeby,
    testrpc,
  },
  mocha: {
    bail: true,
  },
};
