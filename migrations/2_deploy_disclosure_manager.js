const DisclosureManager = artifacts.require('./DisclosureManager.sol');

module.exports = (deployer) => {
  deployer.deploy(DisclosureManager);
};
