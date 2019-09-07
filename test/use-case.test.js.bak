const chai = require('chai');
chai.use(require('chai-things'));
const expect = chai.expect;
chai.should();

describe('Porting', () => {
    const SpellCorrector = require('../src/spell-corrector.js');
    const fs = require('fs');
    const sc = new SpellCorrector(fs.readFileSync(__dirname + '/big.txt', 'utf8'));
    describe('Correction', () => {
        it('Should correct INSERT (speling => spelling)', () => {
            sc.correction('speling').should.be.equal('spelling');
        });
        it('Should correct REPLACE 2 (korrectud => corrected)', () => {
            sc.correction('korrectud').should.be.equal('corrected');
        });
        it('Should correct REPLACE (bycycle => bicycle)', () => {
            sc.correction('bycycle').should.be.equal('bicycle');
        });
        it('Should correct INSERT 2 (inconvient => inconvenient)', () => {
            sc.correction('inconvient').should.be.equal('inconvenient');
        });
        it('Should correct DELETE (arrainged => arranged)', () => {
            sc.correction('arrainged').should.be.equal('arranged');
        });
        it('Should correct TRANSPOSE (peotry => poetry)', () => {
            sc.correction('peotry').should.be.equal('poetry');
        });
        it('Should correct TRANSPOSE + DELETE (peotryy => poetry)', () => {
            sc.correction('peotryy').should.be.equal('poetry');
        });
        it('Should correct KNOWN (word => word)', () => {
            sc.correction('word').should.be.equal('word');
        });
        it('Should correct UNKNOWN (quintessential => quintessential)', () => {
            sc.correction('quintessential').should.be.equal('quintessential');
        });
    });
    describe('Words', () => {
        it('Should catch words properly from "This is a TEST."', () => {
            sc.words('This is a TEST.').should.have.ordered.members(['this', 'test']);
        });
        it('Should catch words properly "This is a test. 123; A TEST this is."', () => {
            sc.words('This is a test. 123; A TEST this is.').should.have.ordered.members(['this', 'test', 'test', 'this']);
        });
        it('Should load 1115504 words', () => {
            const tot = sc.WORDS_COUNT;
            tot.should.be.equal(876736);
        });
        it('Should match 10 most common words', () => {
            sc.WORDS_RANKING[0].should.contain('the');
            sc.WORDS_RANKING[1].should.contain('and');
            sc.WORDS_RANKING[2].should.contain('that');
            sc.WORDS_RANKING[3].should.contain('was');
            sc.WORDS_RANKING[4].should.contain('his');
            sc.WORDS_RANKING[5].should.contain('with');
            sc.WORDS_RANKING[6].should.contain('had');
            sc.WORDS_RANKING[7].should.contain('for');
            sc.WORDS_RANKING[8].should.contain('not');
            sc.WORDS_RANKING[9].should.contain('from');
        });
    });
    describe('Probability', () => {
        it('Should be 0 for quintessential', () => {
            sc.probability('quintessential').should.be.equal(0);
        });
        it('Should be 0.07~0.08 for "the"', () => {
            sc.probability('the').should.be.above(0.09).and.below(0.095);
        });
    });
});