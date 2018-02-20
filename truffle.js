const GWEI = 1000000000;

const defaults = {
  host: 'localhost',
  port: 8545,
  gas: 6000000,
  gasPrice: 5 * GWEI,
};

const testrpc = {
  ...defaults,
  port: 7545,
  network_id: '*',
};

const live = {
  network_id: '1',
  gasPrice: 2 * GWEI, // Truffle only uses this for deploys
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
