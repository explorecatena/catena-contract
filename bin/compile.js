#!/usr/bin/env node

const { run } = require('./lib/util');
const jsonFile = require('jsonfile');
const fs = require('fs-extra');
const path = require('path');

const buildDir = path.resolve(__dirname, '../build/contracts');
const deployedNetworksFile = path.resolve(__dirname, '../deployed-networks.json');

const truffleCompileCommand = `truffle compile ${process.argv.slice(2).join(' ')}`;
console.log(`Running: ${truffleCompileCommand}`);
run(truffleCompileCommand);

console.log(`Merging built artifacts with deployed networks from ${deployedNetworksFile}`);
const deployedNetworks = jsonFile.readFileSync(deployedNetworksFile);
Object.entries(deployedNetworks).forEach(([contractName, networks]) => {
  const artifactFile = `${buildDir}/${contractName}.json`;
  if (!fs.existsSync(artifactFile)) {
    console.error(`Skipping ${contractName}, could not find ${artifactFile}`);
    return;
  }
  const artifact = jsonFile.readFileSync(artifactFile);
  artifact.networks = networks;
  jsonFile.writeFileSync(artifactFile, artifact, { spaces: 2 });
  console.log(`Updated artifact ${artifactFile}`);
});
