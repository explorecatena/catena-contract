#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'lib/publish-disclosures.js');
const args = process.argv.slice(2).join(' ');

try {
  execSync(`truffle exec "${script}" ${args}`, { stdio: 'inherit' });
} catch (e) {
  process.exit(1);
}
