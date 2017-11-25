const Subprovider = require('web3-provider-engine/subproviders/subprovider.js');

class ConditionalSubprovider extends Subprovider {
  constructor({ condition, subprovider }) {
    super();
    this.condition = condition;
    this.subprovider = subprovider;
  }

  handleRequest(payload, next, end) {
    if (this.condition(payload)) {
      this.subprovider.handleRequest(payload, next, end);
    } else {
      next();
    }
  }
}

module.exports = ConditionalSubprovider;
