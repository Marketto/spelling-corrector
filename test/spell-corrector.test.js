const chai = require('chai');
chai.use(require('chai-things'));
const expect = chai.expect;
chai.should();

describe('Test Set 1', () => {
    const SpellCorrector = require('../src/spell-corrector.js');
    const fs = require('fs');
    const sc = new SpellCorrector(fs.readFileSync(__dirname + '/big.txt', 'utf8'));

    const test1 = require('../test/testset1.json');
    const summary = {ok:0, ko:0, start: new Date(), duration: null};
    Object.entries(test1).forEach(([result, words]) => {
        words.forEach((word) => {
            if (sc.correction(word) === result) {
                summary.ok++;
            } else {
                summary.ko++;
            }
        });
    });
    summary.duration = (new Date()).getTime() - summary.start.getTime();
    summary.total = summary.ok + summary.ko;

    it('Should succed above 75%', () => {
        Math.round(summary.ok * 100/ summary.total).should.be.at.least(75);
    });

    it('Should check more than 41 words per second', () => {
        Math.round(summary.total * 1000 / summary.duration).should.be.at.least(41);
    });
});
