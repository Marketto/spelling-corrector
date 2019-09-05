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
    }

    /**
     * Words
     *
     * @param {string} [text='']
     * @returns {Array<string>}
     */
    words(text = '') {
        return text.toLowerCase()
            .match(/(?=(?!_))[^\s"'()\[\],;.:@#*^?!£$%&=\\\/<>°§+\-\|\~\d]{3,}(?<=[^_])/gmi);
    }

    /**
     * Probability
     *
     * @param {string} word
     * @returns {number}
     */
    probability(word){
        return this.WORDS[word] || 0;
        //return ((this.WORDS.find(([dictionaryWord]) => word === dictionaryWord) || []) [1] || 0) / (N || this.WORDS_COUNT);
    }

    /**
     * Correction
     *
     * @param {string} word
     * @returns {string}
     */
    correction(word) {
        return this.candidate(word);
    }

    /**
     * Candidates
     * @method
     * @param {sring} word
     * @returns {Array<string>}
     */
    candidate(word) {
        return this.known(word)
            || this.known(this.matchers(word))
            || this.known(this.matchers(word, true))
            || word;
    }

    /**
     * Known words
     *
     * @param {RegExp|string} matcher
     * @returns {Array<string>}
     */
    known(matcher) {
        if (typeof matcher === 'string') {
            return this.WORDS[matcher];
        }
        return this.WORDS_RANKING.find( word => matcher.test(word));
    }

    /**
     * Matchers
     *
     * @param {string} word
     * @param {boolean} double
     * @returns {Array<string>}
     */
    matchers(word, double) {
        const matches = [];
        const firstMatch = (w, i) => `.?${w[i]}?`;
        const midMatch = (w, i) => `(?:${w[i - 1]}${firstMatch(w, i)}|${w[i]}${w[i - 1]})`;
        const lastMatch = (w, i) => `(?:${w[i - 1]}(?:.${w[i]}|${w[i]}?.?)|${w[i]}${w[i - 1]})`;
        const possibilities = (w, i) => i > 0 ? (i < w.length - 1 ? midMatch(w, i) : lastMatch(w, i)) : firstMatch(w, i);
        for (let i = 0; i < word.length; i++) {
            const part1 = word.substr(0, Math.max(i - 1, 0));
            if (double) {
                const twinMatch = `(?:(?:${possibilities(word, i)}${possibilities(word, i+1)})|(?:${i > 0 ? word.substr(i - 1, 2) : word[i]}..${word[i+1]}))`;
                matches.push(`(?:${part1}${twinMatch}${word.substr(i + 2)})`);
                for (let j = i + 2; j < word.length; j++) {
                    const part2 = word.substring(i + 1, j - 1);
                    const part3 = word.substr(j + 1);
                    matches.push(`(?:${part1}${possibilities(word, i)}${part2}${possibilities(word.substr(i), j - i)}${part3})`);
                }
            } else {
                const part2 = word.substr(i + 1);
                matches.push(`(?:${part1}${possibilities(word, i)}${part2})`);
            }
        }
        return new RegExp(`^(?:${matches.join('|')})$`, 'ui');
    }
}
module.exports = SpellCorrector;