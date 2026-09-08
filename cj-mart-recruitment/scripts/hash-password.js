// Generates a bcrypt hash of a password so you can set ADMIN_PASSWORD_HASH
// in production instead of ADMIN_PASSWORD (plain text).
// Usage: node scripts/hash-password.js "your-new-password"

const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js "your-new-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\nADMIN_PASSWORD_HASH=' + hash);
console.log('\nPut the line above in your .env (and remove any ADMIN_PASSWORD line).\n');
