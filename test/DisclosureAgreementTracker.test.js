const { expect } = require('chai')
const DisclosureAgreementTracker = artifacts.require('./DisclosureAgreementTracker.sol')

const { NULL_BYTES } = require('./util')

const DISCLOSURE_MANAGER_ADDRESS = '0x386a9370ec915d400247bb4d8e34c246cc1eda11'

const TEST_HASH = '0xA0E4C2F76C58916EC258F246851BEA091D14D4247A2FC3E18694461B1816E13B'

contract('DisclosureAgreementTracker', ([address1, address2, address3]) => {
  const TEST_AGREEMENT = [
    TEST_HASH,
    1,
    [address1, address2],
  ]

  let instance

  before(() => DisclosureAgreementTracker.new(DISCLOSURE_MANAGER_ADDRESS).then(contractInstance => {
    instance = contractInstance
  }))

  it('Should have correct disclosure manager address', () =>
    instance.disclosureManager().then((address) =>
      expect(address).to.equal(DISCLOSURE_MANAGER_ADDRESS)))

  it('Should have zero agreements', () =>
    instance.agreementCount().then((count) => expect(count.toString()).to.equal('0')))

  it('Should have zero disclosures', () =>
    instance.disclosureCount().then((count) => expect(count.toString()).to.equal('0')))

  it('Should add agreement', () =>
    instance.addAgreement(...TEST_AGREEMENT)
      .then((txData) => {
        expect(txData.logs).to.have.length(1, 'addAgreement call has no logs')
        expect(txData.logs[0].event).to.equal('agreementAdded', 'addAgreement did not emit agreementAdded event')
      }))

  it('Should have one agreement', () =>
    instance.agreementCount().then((count) => expect(count.toString()).to.equal('1')))

  it('Should have one disclosures', () =>
    instance.disclosureCount().then((count) => expect(count.toString()).to.equal('1')))

  it('Should get newly created agreement', () =>
    instance.getAgreement(TEST_HASH)
      .then((result) => {
        expect(result).to.have.length(6)
        const [previous, disclosureIndex, blockNumber, signedCount, signatories, requiredSignatures] = result
        expect(previous).to.be.a('string').and.equal(NULL_BYTES)
        expect(disclosureIndex.toNumber()).to.equal(TEST_AGREEMENT[1])
        expect(blockNumber.toNumber()).to.be.above(0)
        expect(signedCount.toNumber()).to.equal(0)
        expect(signatories).to.deep.equal(TEST_AGREEMENT[2])
        expect(requiredSignatures).to.deep.equal([true, true])
      }))

  it('Should add first signature', () =>
    instance.signAgreement(TEST_HASH, { from: address1 })
      .then((txData) => {
        console.log('logs:', txData.logs)
        expect(txData.logs).to.have.length(1, 'signAgreement call has no logs')
        expect(txData.logs[0].event).to.equal('agreementSigned', 'signAgreement did not emit agreementSigned event')
      }))

  it('Should count first signature', () =>
    instance.getAgreement(TEST_HASH)
      .then((result) => {
        expect(result).to.have.length(6)
        const [previous, disclosureIndex, blockNumber, signedCount, signatories, requiredSignatures] = result
        expect(signedCount.toNumber()).to.equal(1)
        expect(requiredSignatures).to.deep.equal([false, true])
      }))

  it('Should fail with invalid signature', () =>
    instance.signAgreement(TEST_HASH, { from: address3 })
      .then(() => {
        throw new Error('Call succeeded but should have failed')
      })
      .catch(() => {
        // expect an error
      }))

  it('Should add final signature', () =>
    instance.signAgreement(TEST_HASH, { from: address2 })
      .then((txData) => {
        console.log('logs:', txData.logs)
        expect(txData.logs).to.have.length(2, 'signAgreement did not have enough logs')
        expect(txData.logs[0].event).to.equal('agreementSigned')
        expect(txData.logs[1].event).to.equal('agreementFullySigned')
      }))

  it('Should be fully signed', () =>
    instance.isAgreementFullySigned(TEST_HASH)
      .then((result) => expect(result).to.equal(true)))
})
