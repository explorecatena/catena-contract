const { contract, web3 } = global
if (!contract || !web3) {
  console.error('Error: Run tests using truffle test')
  process.exit(1)
}
const { toHex } = web3

global.Promise = require('bluebird')
const { expect } = require('chai')

const { CatenaContract } = require('../index.js')
const allData = require('./data.json')
const { NULL_BYTES } = require('./util')

const DisclosureManager = artifacts.require('DisclosureManager')
const DisclosureAgreementTracker = artifacts.require('DisclosureAgreementTracker')

const txIdRegex = /^0x[0-9a-fA-F]{64}$/

const DISCLOSURE_COUNT = 4
const testDisclosures = allData.slice(0, DISCLOSURE_COUNT)

function sequentialPublish(publishFn, callback, startingValue = {}) {
  const results = []
  return Promise.reduce(
    testDisclosures,
    (prevResult, disclosure) => {
      console.log(`Publishing: ${JSON.stringify(disclosure)}`)
      return publishFn(disclosure).then((result) => {
        console.log(`Publish result: ${JSON.stringify(result)}`)
        callback(result, prevResult)
        results.push(result)
        return result
      }).delay(1000) // Delay at least one second so timestamps are increasing
    },
    startingValue,
  ).then(() => results)
}

contract('CatenaContract', ([owner, address1, address2]) => {
  let catenaContract
  let disclosureManager
  let agreementTracker

  const createContracts = () => DisclosureManager.new({ from: owner }).then(disclosureManagerInstance => {
    disclosureManager = disclosureManagerInstance
    return DisclosureAgreementTracker.new(disclosureManager.address, { from: owner }).then((agreementTrackerInstance) => {
      agreementTracker = agreementTrackerInstance
      catenaContract = CatenaContract(web3, disclosureManager, agreementTracker)
    })
  })

  before(createContracts)

  it('should expose expected interface', () => {
    expect(catenaContract).to.exist.and.be.a('object')
    const expectedFunctions = [
      'publishDisclosure',
      'syncPublishDisclosureTx',
      'watchDisclosureAdded',
      'createPublishDisclosureTx',
      'getAgreement',
      'getDisclosureAgreementHash',
      'getDisclosureAgreementCount',
      'addAgreement',
      'signAgreement',
      'hasAgreement',
      'hasDisclosureAgreement',
      'isAgreementFullySigned',
      'isDisclosureFullySigned',
    ]
    expectedFunctions.forEach((functionName) => expect(catenaContract).to.have.property(functionName))
  })

  describe('DisclosureManager', () => {

    beforeEach(createContracts)
    
    describe('#publishDisclosure()', () => {
      it('should publish correctly when called multiple times', () =>
        sequentialPublish(
          (d) => catenaContract.publishDisclosure(d),
          (result, prevResult) => {
            const {
              txId, contractAddress, networkId, rowNumber, blockNumber, blockTimestamp,
            } = result
            expect(txId).to.be.a('string').that.matches(txIdRegex)
            expect(contractAddress).to.be.a('string').that.equals(disclosureManager.address)
            expect(networkId).to.be.a('string').that.equals(web3.version.network)
            expect(rowNumber).to.be.a('number').that.equals(prevResult.rowNumber + 1)
            expect(blockNumber).to.be.a('number').that.is.above(prevResult.blockNumber)
            expect(blockTimestamp).to.be.a('number').that.is.above(prevResult.blockTimestamp)
          },
          { rowNumber: 0, blockNumber: 0, blockTimestamp: 0 },
        ).then((results) => {
          expect(results).to.have.lengthOf(DISCLOSURE_COUNT)
        }))
    })

    describe('#publishDisclosureTx()', () => {
      it('should return transaction ID on each call', () =>
        sequentialPublish(
          (d) => catenaContract.publishDisclosureTx(d),
          (txId) => {
            expect(txId).to.be.a('string').that.matches(txIdRegex)
          },
        ).then((txIds) => {
          expect(txIds).to.have.lengthOf(DISCLOSURE_COUNT)
        }))
    })

    describe('#syncPublishDisclosureTx()', () => {
      it('should wait for transaction confirmation', () =>
        catenaContract.publishDisclosureTx(testDisclosures[0])
          .then(catenaContract.syncPublishDisclosureTx)
          .then((result) => {
            const {
              txId, contractAddress, networkId, rowNumber, blockNumber, blockTimestamp,
            } = result
            expect(txId).to.be.a('string').that.matches(txIdRegex)
            expect(contractAddress).to.be.a('string').that.equals(disclosureManager.address)
            expect(networkId).to.be.a('string').that.equals(web3.version.network)
            expect(rowNumber).to.be.a('number').that.above(0)
            expect(blockNumber).to.be.a('number').that.is.above(0)
            expect(blockTimestamp).to.be.a('number').that.is.above(0)
          }))
    })

    describe('#watchDisclosureAdded()', () => {
      it('should record published disclosures', () => {
        const eventResults = {}
        const publishResults = {}

        return catenaContract.watchDisclosureAdded((eventResult) => {
          eventResults[eventResult.txId] = eventResult
        }).then(eventWatcher =>
          sequentialPublish(
            (d) => catenaContract.publishDisclosure(d),
            (result) => {
              publishResults[result.txId] = result
            },
          ).then(() => {
            expect(Object.keys(eventResults)).to.have.lengthOf(DISCLOSURE_COUNT)
            expect(eventResults).to.deep.equals(publishResults)
            eventWatcher.stopWatching()
          }))
      })
    })

    describe('#createPublishDisclosureTx()', () => {
      const organization = 'TEST ORG'
      const recipient = 'BITACCESS INC.'
      const location = 'OTTAWA,ON,CA'
      const amount = 'CAD 1234567'
      const fundingType = 'G'
      const date = '2016-Q2'
      const purpose = 'NAICS:44231'
      const comment = 'MULTI_YEAR'
      const disclosure = {
        organization, recipient, location, amount, fundingType, date, purpose, comment,
      }
      const orderedArgs = [
        organization, recipient, location, amount, fundingType, date, purpose, comment,
      ]
      const txOptions = {
        nonce: 3,
        gas: 288888,
        gasPrice: 686868,
      }
      const partialExpectedTx = {
        value: toHex(0),
        from: owner,
        gasLimit: toHex(txOptions.gas),
        gasPrice: toHex(txOptions.gasPrice),
        nonce: toHex(txOptions.nonce),
        chainId: Number.parseInt(web3.version.network),
      }
      it('should creact correct newEntry tx', () =>
        catenaContract.createPublishDisclosureTx(disclosure, txOptions)
          .then(tx => {
            expect(tx).to.deep.equals(Object.assign({}, partialExpectedTx, {
              to: disclosureManager.address,
              data: disclosureManager.contract.newEntry.getData(...orderedArgs),
            }))
          }))
      it('should create correct amendEntry tx', () => {
        const amendsRow = 343
        return catenaContract.createPublishDisclosureTx(
          Object.assign({ amends: amendsRow }, disclosure),
          txOptions,
        ).then(tx => {
          expect(tx).to.deep.equals(Object.assign({}, partialExpectedTx, {
            to: disclosureManager.address,
            data: disclosureManager.contract.amendEntry.getData(amendsRow, ...orderedArgs),
          }))
        })
      })
      it('should reject invalid amends row number', () =>
        catenaContract.createPublishDisclosureTx(
          Object.assign({ amends: -1 }, disclosure),
          txOptions,
        ).catch(e => e).then((result) => {
          expect(result).to.be.an('error')
        }))
    })
  })
})
