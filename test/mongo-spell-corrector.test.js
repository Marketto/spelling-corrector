const chai = require('chai');
chai.use(require('chai-things'));
chai.should();

describe('Test Set 1', function() {
    const MongoSpellCorrector = require('../src/mongo-spell-corrector.js');
    const sc = new MongoSpellCorrector();
    const test1 = require('../test/testset1.json');
    this.timeout(10000);

    describe('Correction 1', () => {
        const summary = {ok:0, ko:0, start: new Date(), duration: null};
        const promise = Promise.all(Object.entries(test1).map(([result, words]) => Promise.all(words
            .map((word) => {
                return sc.correction(word).then(w => {
                    if (w === result) {
                        summary.ok++;
                    } else {
                        summary.ko++;
                    }
                });
            }))))
            .then(()=>{
                summary.duration = (new Date()).getTime() - summary.start.getTime();
                summary.total = summary.ok + summary.ko;
            });
    
        it('Should succed above 75%', async () => {
            await promise;
            Math.round(summary.ok * 100/ summary.total).should.be.at.least(75);
        });
    
        it('Should check more than 41 words per second', async () => {
            await promise;
            Math.round(summary.total * 1000 / summary.duration).should.be.at.least(41);
        });
    });
    
});
