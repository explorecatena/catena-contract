const { promisify } = require('util');
const truffleContract = require('truffle-contract');
const disclosureManagerSpec = require('./build/contracts/DisclosureManager.json');

const NEW_ENTRY_EVENT_NAME = 'disclosureAdded';
const DEFAULT_GAS_LIMIT = 200000;

function isNumeric(n) {
  return Number.isFinite(Number.parseFloat(n));
}

function strEq(s1, s2) {
  return s1.valueOf() == s2; // eslint-disable-line eqeqeq
}

function init(web3, defaultOptions) {
  const DisclosureManager = truffleContract(disclosureManagerSpec);
  DisclosureManager.setProvider(web3.currentProvider || web3);

  const defaults = Object.assign({
    gas: DEFAULT_GAS_LIMIT,
  }, defaultOptions);
  DisclosureManager.defaults(defaults);

  const getBlock = promisify((numberOrHash, cb) => web3.eth.getBlock(numberOrHash, cb));
  const getNetwork = promisify(web3.version.getNetwork);

  function prepBytes(str, len) {
    if (isNumeric(str)) {
      // Solidity interprets a numeric string as a number, so convert it to hex here
      return web3.fromAscii(str, len);
    }
    if (typeof str !== 'string') {
      throw new Error(`Expected valid string, got ${str}`);
    }
    if (str.length > len) {
      // This can maybe be packed instead!  (but coversions should be done front-end)
      console.error(`Truncating ${str} to ${len}`);
      str = str.substring(0, len);
    }
    return str;
  }

  function prepArg(type, value) {
    let byteCount = /^bytes(\d+)$/.exec(value);
    if (byteCount && byteCount.length > 1) {
      byteCount = Number.parseInt(byteCount[1], 10);
      return prepBytes(value, byteCount);
    }
    return value;
  }

  function prepArgs(functionName, args) {
    const { inputs } = disclosureManagerSpec.abi.find(f => strEq(functionName, f.name));
    return inputs.map(({ name, type }) => {
      const value = args[name];
      if (typeof value === 'undefined' || value === null) {
        throw new Error(`Missing arg ${name} (${type}) for function ${functionName}, got ${JSON.stringify(args)}`);
      }
      return prepArg(type, args[name]);
    });
  }

  function isNewEntryEvent(log) {
    if (!(log && log.event && log.args)) {
      throw new Error(`Invalid log object: ${log}`);
    }
    return strEq(log.event, NEW_ENTRY_EVENT_NAME);
  }

  function resolveInstance(contract) {
    if (typeof contract.deployed === 'function') {
      return contract.deployed();
    }
    return Promise.resolve(contract);
  }

  function parseDisclosureAddedEvent(event) {
    if (!strEq(event.type, 'mined')) {
      throw new Error(`Tx logs for new entry event isn't mined. ${JSON.stringify({ event })}`);
    }

    const {
      transactionHash: txId,
      blockNumber,
      address: contractAddress,
      args: { rowNumber: rowNumberStr },
    } = event;

    if (!isNumeric(rowNumberStr)) {
      throw new Error(`Received invalid rowNumber: ${rowNumberStr}`);
    }

    const rowNumber = Number.parseInt(rowNumberStr);
    return Promise.all([
      getNetwork(),
      getBlock(blockNumber),
    ]).then(([networkId, block]) => ({
      txId,
      contractAddress,
      networkId,
      rowNumber,
      blockNumber,
      blockTimestamp: block.timestamp,
    }));
  }

  /**
    * Publish the provided disclosure to the DisclosureManager contract and resolve to txId after
    * transaction is sent.
    *
    * @param contract [DisclosureManager] - A truffle contract representing the DisclosureManager.
    * @param disclosureData [Object] - The disclosure to publish. Expects object with property
    * names matching arguments defined by DisclosureManager#newEntry()
    *
    * @see https://github.com/trufflesuite/truffle-contract
    */
  function publishDisclosureTx(contractInstance, disclosureData, options = {}) {
    const { contractName } = DisclosureManager;
    const argList = prepArgs('newEntry', disclosureData);
    return resolveInstance(contractInstance)
      .then(instance => instance.owner()
        .then(owner => {
          if (options.from && !strEq(options.from, owner)) {
            throw new Error(`Invalid 'from' address ${options.from}: ${contractName} is owned by ${owner}`);
          }
          options.from = owner;
          return instance;
        }))
      .then(instance => instance.newEntry.sendTransaction(...argList, options));
  }

  function syncPublishDisclosureTx(txId) {
    return Promise.resolve(txId)
      .then(DisclosureManager.syncTransaction)
      .then(receipt => {
        const { tx, logs: txLogs } = receipt;
        if (!tx || !txLogs || !strEq(tx, txId)) {
          throw new Error(`Received invalid result when calling newEntry. ${JSON.stringify(receipt)}`);
        }
        const newEntryEvent = txLogs.find(isNewEntryEvent);
        if (!newEntryEvent) {
          throw new Error(`Could not find new entry event in transaction receipt logs. ${JSON.stringify({ txId, txLogs })}`);
        }
        return txLogs[0];
      })
      .then(parseDisclosureAddedEvent);
  }

  /**
    * Publish the provided disclosure to the DisclosureManager contract and wait for
    * transaction confirmation.
    *
    * @param contract [DisclosureManager] - A truffle contract representing the DisclosureManager.
    * @param disclosureData [Object] - The disclosure to publish. Expects object with property
    * names matching arguments defined by DisclosureManager#newEntry()
    *
    * @see https://github.com/trufflesuite/truffle-contract
    */
  function publishDisclosure(contractInstance, disclosureData, options = {}) {
    return publishDisclosureTx(contractInstance, disclosureData, options)
      .then(syncPublishDisclosureTx);
  }

  function watchDisclosureAdded(contractInstance, callback) {
    return resolveInstance(contractInstance)
      .then(instance => instance.disclosureAdded().watch((err, event) => {
        if (err) {
          console.error(err);
          return;
        }
        parseDisclosureAddedEvent(event)
          .then(callback)
          .catch(console.error);
      }));
  }

  return {
    DisclosureManager,
    publishDisclosure,
    publishDisclosureTx,
    syncPublishDisclosureTx,
    watchDisclosureAdded,
  };
}

module.exports = init;
