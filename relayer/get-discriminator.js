const crypto = require('crypto');

const d = crypto
  .createHash('sha256')
  .update('global:execute_mint')
  .digest()
  .slice(0,8);

console.log('execute_mint discriminator (hex):', d.toString('hex'));
console.log('As array:', JSON.stringify([...d]));