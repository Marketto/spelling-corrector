const MongoSpellCorrector = require('../src/mongo-spell-corrector');
MongoSpellCorrector.generateDb('./test/big.txt')
    .catch(err=> console.error(err))
    .then(()=>console.log("DB READY"));