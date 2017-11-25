const { execSync } = require('child_process');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

module.exports = {
  run,
};
