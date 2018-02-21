const promisify = require('es6-promisify');
const truffleContract = require('truffle-contract');
const disclosureManagerSpec = require('./build/contracts/DisclosureManager.json');

const NEW_ENTRY_EVENT_NAME = 'disclosureAdded';

const GAS_LIMIT_NEW_ENTRY = 250000;
const GAS_LIMIT_AMEND_ENTRY = 500000;

function isNumeric(n) {
  return Number.isFinite(Number.parseFloat(n));
}

const isNil = (x) => typeof x === 'undefined' || x === null;

function init(web3, defaultOptions = {}) {
  const DisclosureManager = truffleContract(disclosureManagerSpec);
  DisclosureManager.setProvider(web3.currentProvider || web3);
  DisclosureManager.defaults(defaultOptions);

  const getBlock = promisify((numberOrHash, cb) => web3.eth.getBlock(numberOrHash, cb));
  const getNetwork = promisify(web3.version.getNetwork);
  const { toHex } = web3;

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
    const { inputs } = disclosureManagerSpec.abi.find(f => functionName === f.name);
    return inputs.map(({ name, type }) => {
      const value = args[name];
      if (isNil(value)) {
        throw new Error(`Missing arg ${name} (${type}) for function ${functionName}, got ${JSON.stringify(args)}`);
      }
      return prepArg(type, args[name]);
    });
  }

  function isNewEntryEvent(log) {
    if (!(log && log.event && log.args)) {
      throw new Error(`Invalid log object: ${log}`);
    }
    return log.event === NEW_ENTRY_EVENT_NAME;
  }

  function resolveInstance(contract) {
    if (typeof contract.deployed === 'function') {
      return contract.deployed();
    }
    return Promise.resolve(contract);
  }

  function parseDisclosureAddedEvent(event) {
    if (!event.type === 'mined') {
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

  function createPublishTxReceiptHandler(txId) {
    return (receipt) => Promise.resolve()
      .then(() => {
        const { tx, logs: txLogs } = receipt;
        if (!tx || !txLogs || !tx === txId) {
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

  function createPublishDisclosureArgs(contractInstance, disclosure, txOptions = {}) {
    const { contractName } = DisclosureManager;
    const { amends: amendsRow } = disclosure;
    const isAmendment = !isNil(amendsRow);
    if (isAmendment && !(typeof amendsRow === 'number' && amendsRow > 0)) {
      return Promise.reject(new Error(`Invalid 'amends' row number ${amendsRow}: must be null, undefined, or a number > 0`));
    }
    const functionName = isAmendment ? 'amendEntry' : 'newEntry';
    const args = prepArgs(functionName, Object.assign({ rowNumber: amendsRow }, disclosure));
    return resolveInstance(contractInstance)
      .then(instance => instance.owner()
        .then(owner => {
          if (txOptions.from && txOptions.from !== owner) {
            throw new Error(`Invalid 'from' address ${txOptions.from}: ${contractName} is owned by ${owner}`);
          }
          return {
            functionName,
            args,
            options: Object.assign({}, defaultOptions, {
              from: owner,
              gas: isAmendment ? GAS_LIMIT_AMEND_ENTRY : GAS_LIMIT_NEW_ENTRY,
            }, txOptions),
          };
        }));
  }

  function createPublishDisclosureTx(contractInstance, disclosureData, txOptions = {}) {
    return Promise.all([
      resolveInstance(contractInstance),
      createPublishDisclosureArgs(contractInstance, disclosureData, txOptions),
    ]).then(([instance, { functionName, args, options }]) => Promise.all([
      instance.contract[functionName].getData(...args),
      instance.address,
      options.from || instance.owner(),
      options.gas || instance[functionName].estimateGas(...args),
      options.gasPrice || web3.eth.getGasPrice(),
      options.nonce || web3.eth.getTransactionCount(options.from),
      getNetwork(),
    ])).then(([data, to, from, gasLimit, gasPrice, nonce, networkId]) => ({
      value: toHex(0),
      data,
      to,
      from,
      gasLimit: toHex(gasLimit),
      gasPrice: toHex(gasPrice),
      nonce: toHex(nonce),
      chainId: Number.parseInt(networkId),
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
  function publishDisclosureTx(contractInstance, disclosureData, txOptions = {}) {
    return resolveInstance(contractInstance)
      .then(instance => createPublishDisclosureArgs(instance, disclosureData, txOptions)
        .then(({ functionName, args, options }) =>
          instance[functionName].sendTransaction(...args, options)));
  }

  function getPublishDisclosureTx(txId) {
    return Promise.resolve(txId)
      .then(DisclosureManager.getTransaction)
      .then(createPublishTxReceiptHandler(txId));
  }

  function syncPublishDisclosureTx(txId) {
    return Promise.resolve(txId)
      .then(DisclosureManager.syncTransaction)
      .then(createPublishTxReceiptHandler(txId));
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
  function publishDisclosure(contractInstance, disclosureData, txOptions = {}) {
    return publishDisclosureTx(contractInstance, disclosureData, txOptions)
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
    getPublishDisclosureTx,
    syncPublishDisclosureTx,
    watchDisclosureAdded,
    createPublishDisclosureTx,
  };
}

module.exports = init;
