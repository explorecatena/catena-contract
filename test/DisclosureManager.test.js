const { assert } = global;
const DisclosureManager = artifacts.require('./DisclosureManager.sol');

const { parseTxBytes } = require('./util.js');

const TEST_ENTRY = [
  'TEST ORG', 'GRANDMAS BAKING LTD.', 'WINNIPEG,MB,CA', 'CAD 333770', 'C', '2016-Q1', 'NAICS:54321', '',
];

const FIELD_NAMES = [
  'organization', 'recipient', 'location', 'value', 'fundingType', 'date', 'purpose', 'comments',
];

// tests
contract('DisclosureManager_jstests', () => {
  DisclosureManager.new()
    .then((instance) => {
      // getListCount test
      it('Should count an empty set of records correctly', () =>
        instance.getListCount()
          .then((count) => assert.equal(count.valueOf(), 0, 'getListCount was not zero')));

      // newEntry test
      it('Should push data successfully', () =>
        instance.newEntry(...TEST_ENTRY)
          .then((txData) => {
            // assert.isAtLeast(rowNumber.valueOf(), 0, 'rowNumber returned was not above zero');
            assert.equal(txData.receipt.transactionIndex.valueOf(), 0, 'newEntry transaction was not successful'); // is transactionIndex the returned rowNumber?  **** mainnet returned 8 instead of 0!!
          }));

      // getListCount test
      it('Should count newly created record', () =>
        instance.getListCount()
          .then((rowNumber) => assert.equal(rowNumber.valueOf(), 1, 'getListCount was not 1')));

      // pullEntry test
      it('Should pull data successfully', () =>
        instance.pullEntry(1)
          .then((txData) =>
            txData.forEach((data, i) =>
              assert.equal(parseTxBytes(data), TEST_ENTRY[i], `${FIELD_NAMES[i]} field was not correct`))));
    });
});
