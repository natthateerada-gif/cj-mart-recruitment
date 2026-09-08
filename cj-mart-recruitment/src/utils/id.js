const crypto = require('crypto');

function uid() {
  return crypto.randomUUID();
}

function newJobId() {
  return 'job-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

module.exports = { uid, newJobId };
