#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */

// Script that prepares files for publishing to npm

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const jsonFile = require('jsonfile');
const { run } = require('./lib/util');

const src = path.resolve(__dirname, '../');
const dist = path.resolve(__dirname, '../dist');

const exported = [
  'build',
  'contracts',
  'index.js',
];

const blacklist = [
  'build/contracts/Migrations.json',
  'contracts/Migrations.sol',
];

console.log('Cleaning unrecognized networks from artifacts');
run('truffle networks --clean');

console.log(`Removing ${dist}`);
fs.removeSync(dist);
fs.mkdirSync(dist);

console.log(`Copying files to ${dist}`);
exported.forEach((files) => fs.copySync(path.join(src, files), path.join(dist, files)));
blacklist.forEach((files) => fs.removeSync(path.join(dist, files)));

const reorderFields = [
  'abi',
];

const removeFields = [
  'sourceMap',
  'deployedSourceMap',
  'ast',
  'updatedAt',
  'sourcePath',
];

glob.sync(path.join(dist, 'build/contracts/*.json')).forEach((file) => {
  console.log(`Cleaning contract spec file ${file}`);
  const spec = jsonFile.readFileSync(file);

  const reorderFieldValues = reorderFields.map((field) => spec[field]);
  reorderFields.concat(removeFields).forEach((field) => delete spec[field]);
  reorderFields.forEach((field, i) => { spec[field] = reorderFieldValues[i]; });

  jsonFile.writeFileSync(file, spec, { spaces: 2 });
});

console.log('Bundling source...');
run('webpack --env dist --colors --progress');

console.log('Done.');
