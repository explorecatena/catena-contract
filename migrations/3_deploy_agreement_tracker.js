const DisclosureManager = artifacts.require('./DisclosureManager.sol');
const DisclosureAgreementTracker = artifacts.require('./DisclosureAgreementTracker.sol');

module.exports = (deployer) => {
  DisclosureManager.deployed().then((instance) => {
    return deployer.deploy(DisclosureAgreementTracker, instance.address);
  });
};
