'use strict';
// Sinh giá trị ngẫu nhiên an toàn cho APP_SECRET và INITIAL_SETUP_TOKEN: npm run secrets
const c = require('crypto');
console.log('APP_SECRET=' + c.randomBytes(48).toString('base64url'));
console.log('INITIAL_SETUP_TOKEN=' + c.randomBytes(24).toString('base64url'));
