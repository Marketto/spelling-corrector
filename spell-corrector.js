class SpellCorrector {

    /**
     *Creates an instance of SpellCorrector.
     * @param {string} sourceText
     */
    constructor(sourceText) {
        const words = this.words(sourceText);
        this.WORDS = Object.entries([{}].concat(words).reduce((aggregator, value) => {
            aggregator[value] = (aggregator[value] || 0) + 1;
            return aggregator;
        })).sort(([,c1], [,c2]) => c1 > c2 ? -1 : (c2 > c1 ? 1 : 0));
    }

    /**
     * Words
     *
     * @param {string} [text='']
     * @returns {Array<string>}
     */
    words(text = '') {
        return (text.toLowerCase()).match(/([^\s"'()\[\],;.:@#*^?!£$%&=\\\/<>°§\d+-]+)/gm);
    }

    /**
     * Probability
     *
     * @param {string} word
     * @param {number} N
     * @returns {number}
     */
    probability(word, N){
        return (this.WORDS.find(([dictionaryWord]) => word === dictionaryWord)[1] || 0) / (N || this.WORDS.length);
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
        return this.known([word])
            || this.known(this.matchers(word))
            || this.known(this.matchers(word, true))
            || word;
    }

    /**
     * Known words
     *
     * @param {Array<string>} wordList
     * @returns {Array<string>}
     */
    known(wordList) {
        const totalMatcher = new RegExp('^(?:' + wordList
            .map(matcherStr => '(?:' + (matcherStr.includes('.') ? matcherStr.replace(/(.)(.)\./g, (m, c1, c2) => `(?:.?${c1}|.?${c2}|.?${c2}.?${c1})`) : `${matcherStr}.{1,2}`) + ')')
            .join('|') + ')$', 'ui');
        return (this.WORDS.find(([word]) => totalMatcher.test(word)) || [])[0];
    }

    /**
     * Matchers
     *
     * @param {string} word
     * @param {boolean} double
     * @returns {Array<string>}
     */
    matchers(word, double) {
        const matches = [word];
        for (let i = 2; i <= word.length; i++) {
            const edit1 = word.substr(0, i) + '.' + word.substr(i);
            if (double) {
                for (let j = i + 3; j <= word.length; j++) {
                    matches.push(edit1.substr(0, j) + '.' + edit1.substr(j));
                }
            } else {
                matches.push(edit1);
            }
        }
        return matches;
    }
}
module.exports = SpellCorrector;