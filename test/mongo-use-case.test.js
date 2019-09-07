const chai = require('chai');
chai.use(require('chai-things'));
const expect = chai.expect;
chai.should();

describe('Porting', function() {
    this.timeout(10000);
    const MongoSpellCorrector = require('../src/mongo-spell-corrector.js');
    const sc = new MongoSpellCorrector();
    describe('Correction', () => {
        it('Should correct INSERT (speling => spelling)', async () => {
            (await sc.correction('speling')).should.be.equal('spelling');
        });
        it('Should correct REPLACE 2 (korrectud => corrected)', async () => {
            (await sc.correction('korrectud')).should.be.equal('corrected');
        });
        it('Should correct REPLACE (bycycle => bicycle)', async () => {
            (await sc.correction('bycycle')).should.be.equal('bicycle');
        });
        it('Should correct INSERT 2 (inconvient => inconvenient)', async () => {
            (await sc.correction('inconvient')).should.be.equal('inconvenient');
        });
        it('Should correct DELETE (arrainged => arranged)', async () => {
            (await sc.correction('arrainged')).should.be.equal('arranged');
        });
        it('Should correct TRANSPOSE (peotry => poetry)', async () => {
            (await sc.correction('peotry')).should.be.equal('poetry');
        });
        it('Should correct TRANSPOSE + DELETE (peotryy => poetry)', async () => {
            (await sc.correction('peotryy')).should.be.equal('poetry');
        });
        it('Should correct KNOWN (word => word)', async () => {
            (await sc.correction('word')).should.be.equal('word');
        });
        it('Should correct UNKNOWN (quintessential => quintessential)', async () => {
            (await sc.correction('quintessential')).should.be.equal('quintessential');
        });
    });
    describe('Probability', () => {
        it('Should be 0 for quintessential', async () => {
            (await sc.probability('quintessential')).should.be.equal(0);
        });
        it('Should be 0.09~0.095 for "the"', async () => {
            (await sc.probability('the')).should.be.above(0.09).and.below(0.095);
        });
    });
});