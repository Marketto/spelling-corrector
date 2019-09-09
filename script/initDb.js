/* eslint-disable no-console */
const MongoSpellCorrector = require('../src/mongo-spell-corrector');
MongoSpellCorrector.initializer('./test/big.txt')
    .then(() => console.log('DB READY'))
    .catch(console.error);