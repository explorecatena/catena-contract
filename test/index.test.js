const { contract, web3 } = global;
if (!contract || !web3) {
  console.error('Error: Run tests using truffle test');
  process.exit(1);
}

global.Promise = require('bluebird');
const { expect } = require('chai');

const init = require('../index.js');
const allData = require('./data.json');

const DisclosureManager = artifacts.require('DisclosureManager');

const txIdRegex = /^0x[0-9a-fA-F]{64}$/;

const DISCLOSURE_COUNT = 4;
const testDisclosures = allData.slice(0, DISCLOSURE_COUNT);

function sequentialPublish(publishFn, callback, startingValue = {}) {
  const results = [];
  return Promise.reduce(
    testDisclosures,
    (prevResult, disclosure) => {
      console.log(`Publishing: ${JSON.stringify(disclosure)}`);
      return publishFn(disclosure).then((result) => {
        console.log(`Publish result: ${JSON.stringify(result)}`);
        callback(result, prevResult);
        results.push(result);
        return result;
      }).delay(1000); // Delay at least one second so timestamps are increasing
    },
    startingValue,
  ).then(() => results);
}

contract('CatenaContract', ([account]) => {
  const CatenaContract = init(web3, {
    from: account,
  });
  let contractInstance;

  beforeEach(() => DisclosureManager.new().then(instance => {
    contractInstance = instance;
  }));

  describe('#init()', () => {
    it('should expose expected interface', () => {
      expect(CatenaContract).to.exist.and.be.a('object');
      expect(CatenaContract.DisclosureManager).to.exist.and.be.a('function'); // [Function: TruffleContract]
      expect(CatenaContract.publishDisclosureTx).to.exist.and.be.a('function');
      expect(CatenaContract.publishDisclosure).to.exist.and.be.a('function');
      expect(CatenaContract.watchDisclosureAdded).to.exist.and.be.a('function');
    });
  });

  describe('#publishDisclosure()', () => {
    it('should publish correctly when called multiple times', () =>
      sequentialPublish(
        (d) => CatenaContract.publishDisclosure(contractInstance, d),
        (result, prevResult) => {
          const {
            txId, contractAddress, networkId, rowNumber, blockNumber, blockTimestamp,
          } = result;
          expect(txId).to.be.a('string').that.matches(txIdRegex);
          expect(contractAddress).to.be.a('string').that.equals(contractInstance.address);
          expect(networkId).to.be.a('string').that.equals(web3.version.network);
          expect(rowNumber).to.be.a('number').that.equals(prevResult.rowNumber + 1);
          expect(blockNumber).to.be.a('number').that.is.above(prevResult.blockNumber);
          expect(blockTimestamp).to.be.a('number').that.is.above(prevResult.blockTimestamp);
        },
        { rowNumber: 0, blockNumber: 0, blockTimestamp: 0 },
      ).then((results) => {
        expect(results).to.have.lengthOf(DISCLOSURE_COUNT);
      }));
  });

  describe('#publishDisclosureTx()', () => {
    it('should return transaction ID on each call', () =>
      sequentialPublish(
        (d) => CatenaContract.publishDisclosureTx(contractInstance, d),
        (txId) => {
          expect(txId).to.be.a('string').that.matches(txIdRegex);
        },
      ).then((txIds) => {
        expect(txIds).to.have.lengthOf(DISCLOSURE_COUNT);
      }));
  });

  describe('#watchDisclosureAdded()', () => {
    it('should record published disclosures', () => {
      const eventResults = {};
      const publishResults = {};

      return CatenaContract.watchDisclosureAdded(contractInstance, (eventResult) => {
        eventResults[eventResult.txId] = eventResult;
      }).then(eventWatcher =>
        sequentialPublish(
          (d) => CatenaContract.publishDisclosure(contractInstance, d),
          (result) => {
            publishResults[result.txId] = result;
          },
        ).then(() => {
          expect(Object.keys(eventResults)).to.have.lengthOf(DISCLOSURE_COUNT);
          expect(eventResults).to.deep.equals(publishResults);
          eventWatcher.stopWatching();
        }));
    });
  });
});
