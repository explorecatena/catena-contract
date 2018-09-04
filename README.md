# Catena Smart Contract


[![npm (scoped)](https://img.shields.io/npm/v/@catena/contract.svg)](https://www.npmjs.com/package/@catena/contract)
[![Build Status](https://travis-ci.org/explorecatena/catena-contract.svg?branch=master)](https://travis-ci.org/explorecatena/catena-contract)

Used to publish NRC public funding disclosures and on the Ethereum blockchain.

Built using the [Truffle Framework](http://truffleframework.com/).


## Usage

Install:

`npm install @catena/contract`

Example usage:

```javascript
const initCatenaContract = require('@catena/contract')

const { DisclosureManager } = initCatenaContract(web3)

DisclosureManager.deployed()
  .then(instance => instance.pullRow(687))
  .then(result => ...)
```

For more information on using a truffle contract see [Truffle Docs](http://truffleframework.com/docs/).

## Development

### Setup

- Install node dependencies: `npm install`
- Install an ethereum node: [Parity](https://github.com/paritytech/parity) or [Geth](https://github.com/ethereum/go-ethereum)

#### Parity

Parity works well but you must have the geth flag enabled or truffle migrations will fail.

`parity --chain rinkeby --geth`

Optionally, add the following for more convenient testing:

`--unlock <address> --password <passwordfile>`

#### Geth

If connecting to an actual testnet or mainnet network, you will first need time to sync
the blockchain.  Running in --fast mode helps:

`geth --fast --rpc --rpcapi eth,net,web3,personal --rpccorsdomain="*"`

Using mist:

`./mist --syncmode=fast --cache=1024`

To test using rinkeby:

`geth --rinkeby --fast --rpc --rpcapi eth,net,web3,personal --rpccorsdomain="*"`

Attaching to the geth node (assuming it's on localhost):

`geth attach http://127.0.0.1:8545`

* geth commands

From the geth console you can look at the balance of your primary account:

`eth.getBalance("0x0d9cf77f30e7af582762418d7011ef486a388275")`

Also, you can unlock your primary account to use its ether for testing or execution:

`personal.unlockAccount("0x0d9cf77c30e7af582752418d7011ef486a388275", "password123", 0)`



### Testing ###

Testing the smart contract can be done as follows:

`npm test`

This will start a testrpc server and run truffle test.
To run a specific test:

`npm test test/DisclosureManageTests.sol`

If you want to run tests on a different network like rinkeby, for example, use:

`npm test --network rinkeby`

