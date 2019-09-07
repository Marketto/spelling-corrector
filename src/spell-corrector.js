class SpellCorrector {

    /**
     *Creates an instance of SpellCorrector.
     * @param {string} sourceText
     */
    constructor(sourceText) {
        const words = this.words(sourceText);
        this.WORDS_COUNT = words.length;
        const wordsGrouped = Object.entries([{}].concat(words).reduce((aggregator, value) => {
            aggregator[value] = (isNaN(aggregator[value]) ? 0 : aggregator[value]) + 1;
            return aggregator;
        })).sort(([,c1], [,c2]) => c1 > c2 ? -1 : (c2 > c1 ? 1 : 0));
        this.WORDS_RANKING = wordsGrouped.map(([word]) => word);
        this.WORDS = [{}].concat(wordsGrouped).reduce((aggr, [word, occurencies]) => Object.assign(aggr, {[word]: occurencies / words.length}));
        this.LETTERS = [''].concat(this.WORDS_RANKING).reduce((a, b) => {
            b.split('').forEach(c => {
                if (!a.includes(c)) {
                    a += c;
                }
            });
            return a;
        });
    }

    /**
     * Words
     *
     * @param {string} [text='']
     * @returns {Array<string>}
     */
    words(text = '') {
        return text.toLowerCase()
            .match(/(?=(?!_))[^\s"'()[\],;.:@#*^?!£$%&=\\\/<>°§+\-|~\d]{3,}(?<=[^_])/gmiu);
    }

    /**
     * Probability
     *
     * @param {string} word
     * @returns {number}
     */
    probability(word){
        return this.WORDS[word] || 0;
    }

    /**
     * Correction
     *
     * @param {string} word
     * @returns {string}
     */
    correction(word) {
        return this.candidates(word).next().value;
    }

    /**
     * Correction
     *
     * @param {string} word
     * @yield {string}
     */
    * candidates(word) {
        if(this.WORDS[word]){
            yield word;
        }
        
        yield* Array.from(this.known(this.edits1(word)))
            .sort((a, b) => Math.sign([a, b].map(v => this.WORDS_RANKING.indexOf(v)).reduce((ra, rb)=>ra-rb)));
        
        yield* Array.from(this.known(this.edits2(word)))
            .sort((a, b) => Math.sign([a, b].map(v => this.WORDS_RANKING.indexOf(v)).reduce((ra, rb)=>ra-rb)));
    
        return word;
    }

    /**
     * Edits
     *
     * @param {Iterator<string>} editIterator
     * @yield {string}
     */
    * known(editIterator) {
        for (let variant of editIterator) {
            if(this.WORDS[variant]){
                yield variant;
            }
        }
    }

    /**
     * Edits
     *
     * @param {string} word
     * @yield {string}
     */
    * edits1(word) {
        for (let i = 0; i < word.length; i++) {
            const leftSlice = word.substring(0, i);
            const rightSlice = word.substring(i + 1);
            yield leftSlice + rightSlice;
            yield leftSlice + word[i + 1] + word[i] + rightSlice.substring(1);
            for (let l = 0; l < this.LETTERS.length; l++) {
                const c = this.LETTERS[l];
                if (c !== word[i]) {
                    yield leftSlice + c + rightSlice;
                }
                yield leftSlice + c + word[i] + rightSlice;
            }
        }
        for (let l = 0; l < this.LETTERS.length; l++) {
            yield word + this.LETTERS[l];
        }
    }

    /**
     * Edits
     *
     * @param {string} word
     * @yield {string}
     */
    * edits2(word) {
        const edits1 = this.edits1(word);
        for (let edit of edits1) {
            yield* this.edits1(edit);
        }
    }
}
module.exports = SpellCorrector;