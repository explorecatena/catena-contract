const promisify = require('es6-promisify')
const truffleContract = require('truffle-contract')
const disclosureManagerSpec = require('./build/contracts/DisclosureManager.json')
const agreementTrackerSpec = require('./build/contracts/DisclosureAgreementTracker.json')

const NEW_ENTRY_EVENT_NAME = 'disclosureAdded'

const GAS_LIMIT_NEW_ENTRY = 250000
const GAS_LIMIT_AMEND_ENTRY = 500000
const GAS_LIMIT_ADD_AGREEMENT = 500000
const GAS_LIMIT_SIGN_AGREEMENT = 100000

const identity = (x) => x

const hexRegex = /^0x[0-9a-f]*$/

function isNumeric (n) {
  return Number.isFinite(Number.parseFloat(n))
}

function isPlainObject (x) {
  return typeof x === 'object' && !Array.isArray(x) && x !== null
}

const isNil = (x) => typeof x === 'undefined' || x === null

const DisclosureManager = truffleContract(disclosureManagerSpec)

const DisclosureAgreementTracker = truffleContract(agreementTrackerSpec)

function resolveInstance (contract) {
  if (typeof contract.deployed === 'function') {
    return contract.deployed()
  }
  return Promise.resolve(contract)
}

function CatenaContract (web3, disclosureManagerContract = DisclosureManager, agreementTrackerContract = DisclosureAgreementTracker) {
  const web3Provider = web3.currentProvider || web3
  DisclosureManager.setProvider(web3Provider)
  DisclosureAgreementTracker.setProvider(web3Provider)
  const disclosureManagerPromise = resolveInstance(disclosureManagerContract)
  const agreementTrackerPromise = resolveInstance(agreementTrackerContract)

  const getBlock = promisify((numberOrHash, cb) => web3.eth.getBlock(numberOrHash, cb))
  const getNetwork = promisify(web3.version.getNetwork.bind(web3.version))
  const getGasPrice = promisify(web3.eth.getGasPrice.bind(web3.eth))
  const getTransactionCount = promisify(web3.eth.getTransactionCount.bind(web3.eth))
  const { toHex } = web3

  function prepBytes (bytes, len) {
    if (typeof bytes === 'number') {
      // convert all numbers to ascii
      bytes = bytes.toString()
    }
    if (typeof bytes !== 'string') {
      throw new Error(`prepBytes expected valid number or string, got ${bytes}`)
    }
    if (!bytes.startsWith('0x')) {
      bytes = web3.fromAscii(bytes, len)
    }
    if (((bytes.length - 2) / 2) > len) {
      console.error(`Truncating ${bytes} to ${len}`)
      return bytes.substring(0, (len * 2) + 2)
    }
    return bytes
  }

  function prepArg (type, value) {
    let byteCount = /^bytes(\d+)$/.exec(value)
    if (byteCount && byteCount.length > 1) {
      byteCount = Number.parseInt(byteCount[1], 10)
      return prepBytes(value, byteCount)
    }
    return value
  }

  function prepArgs (contractInstance, functionName, args) {
    const fn = contractInstance.abi.find(f => functionName === f.name)
    if (!fn) {
      throw new Error(`Function ${functionName} does not exist on contract ${contractInstance.constructor.contractName}`)
    }
    return fn.inputs.map(({ name, type }, i) => {
      const value = Array.isArray(args) ? args[i] : args[name]
      if (isNil(value)) {
        throw new Error(`Missing arg ${name} (${type}) for function ${functionName}, got ${JSON.stringify(args)}`)
      }
      return prepArg(type, value)
    })
  }

  function wrapCall (contractInstancePromise, functionName, resultHandler = identity) {
    return (...args) => {
      return contractInstancePromise.then(contractInstance => {
        let options = args[args.length - 1]
        if (isPlainObject(options)) {
          args = args.slice(0, args.length - 1)
        } else {
          options = undefined
        }
        if (args.length === 1 && isPlainObject(args[0])) {
          // Args specified by name instead of positionally
          args = args[0]
        }
        const preppedArgs = prepArgs(contractInstance, functionName, args)
        return contractInstance[functionName](...preppedArgs, options)
          .then(resultHandler)
      })
    }
  }

  function isNewEntryEvent (log) {
    if (!(log && log.event && log.args)) {
      throw new Error(`Invalid log object: ${log}`)
    }
    return log.event === NEW_ENTRY_EVENT_NAME
  }

  function parseDisclosureAddedEvent (event) {
    const {
      transactionHash: txId,
      blockNumber,
      address: contractAddress,
      args: { rowNumber: rowNumberStr }
    } = event

    if (!isNumeric(rowNumberStr)) {
      throw new Error(`Received invalid rowNumber: ${rowNumberStr}`)
    }

    const rowNumber = Number.parseInt(rowNumberStr)
    return Promise.all([
      getNetwork(),
      getBlock(blockNumber)
    ]).then(([networkId, block]) => ({
      txId,
      contractAddress,
      networkId,
      rowNumber,
      blockNumber,
      blockTimestamp: block.timestamp
    }))
  }

  function handlePublishTx (expectedTxId, tx) {
    return Promise.resolve()
      .then(() => {
        const { tx: txId, logs: txLogs } = tx
        if (!txId || !txLogs || txId !== expectedTxId) {
          throw new Error(`Received invalid publish tx. ${JSON.stringify(tx)}`)
        }
        const newEntryEvent = txLogs.find(isNewEntryEvent)
        if (!newEntryEvent) {
          throw new Error(`Could not find new entry event in transaction receipt logs. ${JSON.stringify({ txId, txLogs })}`)
        }
        return txLogs[0]
      })
      .then(parseDisclosureAddedEvent)
  }

  function createTxFn (contractPromise, createArgsFn) {
    return (args, txOptions = {}) => {
      return contractPromise.then(contractInstance =>
        createArgsFn(contractInstance, args, txOptions)
          .then(({ functionName, args, options }) => Promise.all([
            contractInstance.contract[functionName].getData(...args),
            contractInstance.address,
            options.from || contractInstance.owner(),
            options.gas || contractInstance[functionName].estimateGas(...args),
            options.gasPrice || getGasPrice(),
            options.nonce || getTransactionCount(options.from),
            getNetwork()
          ])).then(([data, to, from, gasLimit, gasPrice, nonce, networkId]) => ({
            value: toHex(0),
            data,
            to,
            from,
            gasLimit: toHex(gasLimit),
            gasPrice: toHex(gasPrice),
            nonce: toHex(nonce),
            chainId: Number.parseInt(networkId)
          })))
    }
  }

  function createPublishDisclosureArgs (contractInstance, disclosure, txOptions = {}) {
    const { amends: amendsRow } = disclosure
    const isAmendment = !isNil(amendsRow)
    if (isAmendment && !(typeof amendsRow === 'number' && amendsRow > 0)) {
      return Promise.reject(new Error(`Invalid 'amends' row number ${amendsRow}: must be null, undefined, or a number > 0`))
    }
    const functionName = isAmendment ? 'amendEntry' : 'newEntry'
    const args = prepArgs(contractInstance, functionName, Object.assign({ rowNumber: amendsRow }, disclosure))
    return contractInstance.owner().then(owner => {
      if (txOptions.from && txOptions.from !== owner) {
        throw new Error(`Invalid 'from' address ${txOptions.from}: contract is owned by ${owner}`)
      }
      return {
        functionName,
        args,
        options: Object.assign({
          from: owner,
          gas: isAmendment ? GAS_LIMIT_AMEND_ENTRY : GAS_LIMIT_NEW_ENTRY
        }, txOptions)
      }
    })
  }

  const createPublishDisclosureTx = createTxFn(disclosureManagerPromise, createPublishDisclosureArgs)

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
  function publishDisclosureTx (disclosureData, txOptions = {}) {
    return disclosureManagerPromise.then(disclosureManager =>
      createPublishDisclosureArgs(disclosureManager, disclosureData, txOptions)
        .then(({ functionName, args, options }) =>
          disclosureManager[functionName].sendTransaction(...args, options)))
  }

  function getPublishDisclosureTx (txId) {
    return DisclosureManager.getTransaction(txId)
      .then(tx => {
        if (!(tx && tx.receipt && tx.receipt.blockNumber)) {
          return null
        }
        return handlePublishTx(txId, tx)
      })
  }

  function syncPublishDisclosureTx (txId) {
    return DisclosureManager.syncTransaction(txId)
      .then(tx => handlePublishTx(txId, tx))
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
  function publishDisclosure (disclosureData, txOptions = {}) {
    return publishDisclosureTx(disclosureData, txOptions)
      .then(syncPublishDisclosureTx)
  }

  function watchDisclosureAdded (callback) {
    return disclosureManagerPromise.then(disclosureManager =>
      disclosureManager.disclosureAdded().watch((err, event) => {
        if (err) {
          console.error(err)
          return
        }
        parseDisclosureAddedEvent(event)
          .then(callback)
          .catch(console.error)
      }))
  }

  const parseDisclosurePull = (result) => {
    const [
      organization, recipient, location, amount, fundingType, date, purpose, comment
    ] = result.slice(0, 8).map(x => web3.toAscii(x).replace(/\0/g, ''))
    const amends = result[8]
    return {
      organization,
      recipient,
      location,
      amount,
      fundingType,
      date,
      purpose,
      comment,
      amends: (amends ? amends.toNumber() : 0) || null
    }
  }

  const isValidHash = (h) => typeof h === 'string' && hexRegex.test(h)

  function createAddAgreementArgs (contractInstance, agreement, txOptions = {}) {
    return Promise.resolve().then(() => {
      const { agreementHash, disclosureIndex, signatories } = agreement
      if (!isValidHash(agreementHash)) {
        throw new Error('Invalid "agreementHash": must be a hex string')
      }
      if (typeof disclosureIndex !== 'number' || disclosureIndex < 1) {
        throw new Error('Invalid "disclosureIndex": must be number greater than 0')
      }
      if (!Array.isArray(signatories) ||
        signatories.length === 0 ||
        signatories.some((s) => !web3.isAddress(s))) {
        throw new Error('Invalid "signatories": must be non-empty array of addresses')
      }
      const functionName = 'addAgreement'
      const args = prepArgs(contractInstance, functionName, agreement)
      return contractInstance.owner().then(owner => {
        if (txOptions.from && txOptions.from !== owner) {
          throw new Error(`Invalid 'from' address ${txOptions.from}: contract is owned by ${owner}`)
        }
        return {
          functionName,
          args,
          options: Object.assign({
            from: owner,
            gas: GAS_LIMIT_ADD_AGREEMENT
          }, txOptions)
        }
      })
    })
  }

  function createSignAgreementArgs (contractInstance, agreementHash, txOptions = {}) {
    return Promise.resolve().then(() => {
      if (!isValidHash(agreementHash)) {
        throw new Error('Invalid "agreementHash": must be a hex string')
      }
      const functionName = 'signAgreement'
      const args = prepArgs(contractInstance, functionName, { agreementHash })
      return {
        functionName,
        args,
        options: Object.assign({
          gas: GAS_LIMIT_SIGN_AGREEMENT,
        }, txOptions)
      }
    })
  }

  const createAddAgreementTx = createTxFn(agreementTrackerPromise, createAddAgreementArgs)

  const getDisclosure = wrapCall(disclosureManagerPromise, 'pullRow', parseDisclosurePull)

  const getDisclosureAmendment = wrapCall(disclosureManagerPromise, 'pullEntry', parseDisclosurePull)

  const getDisclosureCount = wrapCall(disclosureManagerPromise, 'getListCount', (x) => x.toNumber())

  const getDisclosureManagerAddress = wrapCall(agreementTrackerPromise, 'disclosureManager')

  const getAgreement = wrapCall(agreementTrackerPromise, 'getAgreement', ([
    previous, disclosureIndex, blockNumber, signedCount, signatories, requiredSignatures,
  ]) => Promise.all([
    agreementTrackerPromise,
    getDisclosureManagerAddress(),
  ]).then(([contractInstance, disclosureManagerAddress]) => {
    const disclosureIndexNumber = disclosureIndex.toNumber()
    if (disclosureIndexNumber === 0) {
      return null
    }
    return {
      contractAddress: contractInstance.address,
      previous,
      disclosureManagerAddress,
      disclosureIndex: disclosureIndexNumber,
      blockNumber: blockNumber.toNumber(),
      signedCount: signedCount.toNumber(),
      signatories: signatories,
      requiredSignatures: signatories.reduce((byAddress, address, i) => Object.assign(byAddress, {
        [address]: requiredSignatures[i],
      }), {})
    }
  }))

  const getDisclosureAgreementHash = wrapCall(agreementTrackerPromise, 'latestMap', (result) => result[0])

  const getDisclosureAgreementCount = wrapCall(agreementTrackerPromise, 'latestMap', (result) => result[1].toNumber())

  const addAgreement = wrapCall(agreementTrackerPromise, 'addAgreement')

  const signAgreement = wrapCall(agreementTrackerPromise, 'signAgreement')

  const createSignAgreementTx = createTxFn(agreementTrackerPromise, createSignAgreementArgs)

  const hasAgreement = wrapCall(agreementTrackerPromise, 'hasAgreement')

  const hasDisclosureAgreement = wrapCall(agreementTrackerPromise, 'hasDisclosureAgreement')

  const isAgreementFullySigned = wrapCall(agreementTrackerPromise, 'isAgreementFullySigned')

  const isDisclosureFullySigned = wrapCall(agreementTrackerPromise, 'isDisclosureFullySigned')

  return {
    publishDisclosure,
    publishDisclosureTx,
    getPublishDisclosureTx,
    syncPublishDisclosureTx,
    watchDisclosureAdded,
    createPublishDisclosureTx,
    getDisclosure,
    getDisclosureAmendment,
    getDisclosureCount,
    getAgreement,
    getDisclosureAgreementHash,
    getDisclosureAgreementCount,
    createAddAgreementTx,
    addAgreement,
    signAgreement,
    createSignAgreementTx,
    hasAgreement,
    hasDisclosureAgreement,
    isAgreementFullySigned,
    isDisclosureFullySigned,
    getDisclosureManager: () => disclosureManagerPromise,
    getDisclosureAgreementTracker: () => agreementTrackerPromise,
  }
}

module.exports = {
  CatenaContract,
  DisclosureManager,
  DisclosureAgreementTracker,
}
