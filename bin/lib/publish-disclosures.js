/* global web3 */
/* Script to run using truffle exec */
const jsonFile = require('jsonfile');
const path = require('path');
const minimist = require('minimist');
const fs = require('fs-extra');
const bluebird = require('bluebird');

const init = require('../../index');
const truffleConfig = require('../../truffle');

module.exports = (cb) => {
  const Promise = bluebird;
  const args = minimist(process.argv.slice(2), {
    default: {
      c: 10,
      network: 'default',
    },
  });

  const networkConfig = truffleConfig.networks[args.network];
  const {
    DisclosureManager, publishDisclosureTx, watchDisclosureAdded, syncPublishDisclosureTx,
  } = init(web3, {
    gasPrice: networkConfig.txGasPrice || networkConfig.gasPrice,
  });
  const contractInstance = DisclosureManager.deployed();

  if (!args.f) {
    console.error(`Usage: ${path.basename(__filename)} -f <path to json entries> [-c <maxUnconfirmed>]`);
    process.exit(1);
  }
  const disclosuresPath = args.f;
  const maxUnconfirmed = args.c;

  // Backup input file
  const backupFile = `${disclosuresPath}.${new Date().toISOString()}.bak`;
  fs.copySync(disclosuresPath, backupFile);
  console.log(`Input file backed up: ${backupFile}\n`);

  function readInput() {
    return Object.entries(jsonFile.readFileSync(disclosuresPath)).map(([id, data]) => ({
      id,
      ...data,
    }));
  }

  const inputDisclosuresArray = readInput();
  const allDisclosures = {};
  inputDisclosuresArray.forEach((disclosure) => { allDisclosures[disclosure.id] = disclosure; });
  const totalDisclosures = inputDisclosuresArray.length;

  function writeOutput() {
    const idToDisclosure = {};
    Object.values(allDisclosures).forEach(({ id, ...data }) => {
      idToDisclosure[id] = data;
    });
    jsonFile.writeFileSync(disclosuresPath, idToDisclosure, { spaces: 2 });
  }

  function updateDisclosure(disclosure) {
    allDisclosures[disclosure.id] = disclosure;
    writeOutput();
  }

  const unconfirmedTx = {};
  let confirmedCount = 0;

  const unpublishedDisclosures = inputDisclosuresArray.filter((entry) => {
    if (entry.txId && entry.blockNumber) {
      // Transaction already confirmed in earlier run
      confirmedCount += 1;
      return false;
    }
    return true;
  });

  function canSend() {
    return Object.keys(unconfirmedTx).length < maxUnconfirmed;
  }

  function throttle() {
    return new Promise(accept => {
      if (canSend()) {
        accept();
      } else {
        const timer = setInterval(() => {
          if (canSend()) {
            clearInterval(timer);
            accept();
          }
        }, 500);
      }
    });
  }

  function handleDisclosurePublished(publishedData) {
    const { txId } = publishedData;
    const disclosure = unconfirmedTx[txId];
    if (!disclosure) {
      console.error(`Received unknown published disclosure data for ${txId}: ${publishedData}`);
      return;
    }
    updateDisclosure({
      ...disclosure,
      ...publishedData,
    });
    confirmedCount += 1;
    delete unconfirmedTx[txId];
    console.log(`Successfully published ${confirmedCount}/${totalDisclosures}: ${disclosure.id}`);
  }

  function handleDisclosureSent(disclosure) {
    const { txId } = disclosure;
    updateDisclosure(disclosure);
    unconfirmedTx[txId] = disclosure;
    console.log(`Sent transaction: ${disclosure.id} -> ${txId}`);
  }

  const eventWatcherPromise = watchDisclosureAdded(contractInstance, (publishedData) => {
    handleDisclosurePublished(publishedData);
    if (confirmedCount >= totalDisclosures) {
      eventWatcherPromise.then(e => e.stopWatching());
    }
  });

  Promise.each(unpublishedDisclosures, (entry) => {
    if (entry.txId) {
      // Transaction sent in earlier run but confirmation wasn't received.
      unconfirmedTx[entry.txId] = entry;
      console.log(`Disclosure ${entry.id} already sent... waiting for confirmation: ${entry.txId}`);
      return Promise.resolve(entry.txId)
        .then(syncPublishDisclosureTx)
        .then(handleDisclosurePublished);
    }
    return throttle()
      .then(() => publishDisclosureTx(contractInstance, entry.contractData))
      .then((txId) => Object.assign({}, entry, { txId }))
      .then(handleDisclosureSent);
  });

  cb();
};
