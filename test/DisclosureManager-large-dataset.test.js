// Javascript tests to push large sets of data to DisclosureManager smart contract
/* eslint-disable no-plusplus */
const { assert } = global;
const DisclosureManager = artifacts.require('./DisclosureManager.sol');

const { parseTxBytes } = require('./util.js');

// limiting factor here will be the gas you have in your test account (also 5 digits, ie. max 99999)
const pushCount = 200;
const pullCount = 10;

contract('DisclosureManager - Large Dataset', () => {
  DisclosureManager.new()
    .then((instance) => {
      it(`Should push ${pushCount} disclosures successfully`, () => {
        // Run mass push tests
        const promises = [];
        for (let count = 1; count <= pushCount; count++) {
          const promise = instance.newEntry(
            'EXAMPLE ORG', 'COOL COMPANY INC', 'Montreal, Quebec',
            `$1${count}.00`, 'C', '2016-Q3', `NAICS: ${count}`, 'MULTI_YEAR',
          ).then((txData) =>
            assert.equal(txData.receipt.transactionIndex.valueOf(), 0, 'transactionIndex was not zero'));
          promises.push(promise);
        }
        return Promise.all(promises);
      });

      // getListCount test
      it('Should count newly created records', () =>
        instance.getListCount()
          .then((rowCount) => assert.equal(rowCount.valueOf(), pushCount, 'getListCount was not pushes')));

      it(`Should pull ${pullCount} entries successfully`, () => {
        // Run random pull tests
        const promises = [];
        for (let count = 1; count <= pullCount; count++) {
          const row = Math.floor(Math.random() * pushCount) + 1;
          const promise = instance.pullEntry.call(row)
            .then((txData) =>
              assert.equal(parseTxBytes(txData[6]), `NAICS: ${row}`, 'reference field was not correct'));
          promises.push(promise);
        }
        return Promise.all(promises);
      });
    });
});
