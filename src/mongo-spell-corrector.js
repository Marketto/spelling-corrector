const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;

const DEFAULT_DB_ADDRESS = 'mongodb://localhost:27017';
const DEFAULT_DB_NAME = 'spellchecker';

class MongoSpellCorrector {
    /**
     * Db Init and feed
     *
     * @static
     * @async
     * @param {string} fileName
     * @param {string} [dbUrl=DEFAULT_DB_ADDRESS]
     * @param {string} [dbName=DEFAULT_DB_NAME]
     * @memberof MongoSpellCorrector
     */
    static async generateDb(fileName, dbUrl = DEFAULT_DB_ADDRESS, dbName = DEFAULT_DB_NAME) {
        const words = this.words(fs.readFileSync(fileName, 'utf8'));
        const WORDS = [{}].concat(words).reduce((aggregator, value) => {
            aggregator[value] = (isNaN(aggregator[value]) ? 0 : aggregator[value]) + 1;
            return aggregator;
        });
        const wordsGrouped = Object.entries(WORDS).sort(([,c1], [,c2]) => c1 > c2 ? -1 : c2 > c1 ? 1 : 0);
        const wordsRanking = wordsGrouped.map(([word]) => word);

        const letters = [''].concat(wordsRanking).reduce((a, b) => {
            b.split('').forEach(c => {
                if (!a.includes(c) && c !== '_') {
                    a += c;
                }
            });
            return a;
        });

        const client = await MongoClient.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });
        try {
            const db = client.db(dbName);
            await db.listCollections().toArray().then(collections => Promise.all(collections.map(({name}) => db.dropCollection(name))));

            await db.createCollection('words');
            const wordsCollection = db.collection('words');
            await wordsCollection.createIndex({ word:1 }, { unique: true });
            await wordsCollection.createIndex({ 'mistakes.mistake':1 });
            const wordsRankingLength = wordsRanking.length;
            const ignoreMap = Object.freeze([{}].concat(wordsRanking).reduce((aggr, w) => Object.assign(aggr, {[w]: true})));
            for (let rank = 0; rank < wordsRankingLength; rank++){
                const word = wordsRanking[rank];
                const edits1 = Array.from(this.edits(word, letters, ignoreMap));
                const mistakes1 = edits1
                    .map(mistake => ({
                        mistake,
                        weight: mistake.length === word.length ? 1.2 : 1 
                    }));
                const edits2 = Array.from(this.reEdits(edits1, letters, ignoreMap, this.minWordLength + 1));
                const mistakes2 = edits2
                    .map(mistake => ({
                        mistake,
                        weight: mistake.length === word.length ? 2.4 : Math.abs(mistake.length - word.length) === 1 ? 2.2 : 2 
                    }));
                let mistakes;
                if (mistakes2.length > 1) {
                    mistakes = mistakes1.concat(mistakes2);
                } else {
                    mistakes = mistakes1;
                }
                
                const count = WORDS[word];

                await wordsCollection.insertOne({
                    word,
                    rank,
                    count,
                    probability: count/words.length,
                    mistakes
                });
                const progress = Math.round((rank + 1) * 1000/wordsRankingLength)/10;
                // eslint-disable-next-line no-console
                console.log(`${progress}% - ${rank + 1} di ${wordsRankingLength}`);
            }
            return await client.close();
        } catch(e) {
            client.close();
            throw e;
        }
    }

    static get minWordLength() {
        return 3;
    }

    static get symbolPattern() {
        return '\\s"\'()[\\],;.:@#*^?!£$%&=\\\\/<>°§+\\-|~\\d';
    }

    /**
     * Words
     *
     * @param {string} [text='']
     * @returns {Array<string>}
     */
    static words(text = '') {
        return text.toLowerCase()
            .match(new RegExp(`(?=(?!_))[^${this.symbolPattern}]{${this.minWordLength},}(?<=[^_])`, 'gmiu'));
    }

    /**
     * Edits
     *
     * @param {string} word
     * @param {string} letters
     * @param {Object} [ignoreMap={}]
     * @yield {string}
     */
    static* edits(word, letters = ['*'], ignoreMap = {}) {
        const history = Object.assign({ [word]: true }, ignoreMap);
        const checkHistory = value => {
            if (!history[value] && value.length >= this.minWordLength){
                history[value] = true;
                return value;
            }
        };
        for (let i = 0; i < word.length; i++) {
            const leftSlice = word.substring(0, i);
            const rightSlice = word.substring(i + 1);
            
            const deletion = checkHistory(leftSlice + rightSlice);
            if (deletion) {
                yield deletion;
            }
            if (i < word.length -1) {
                const swap = checkHistory(leftSlice + word[i + 1] + word[i] + rightSlice.substring(1));
                if (swap) {
                    yield swap;
                }
            }
            for (let l = 0; l < letters.length; l++) {
                const c = letters[l];
                if (c !== word[i]) {
                    const replace = checkHistory(leftSlice + c + rightSlice);
                    if (replace) {
                        yield replace;
                    }
                }
                const addition = checkHistory(leftSlice + c + word[i] + rightSlice);
                if (addition) {
                    yield addition;
                }
            }
        }
        for (let l = 0; l < letters.length; l++) {
            const addition = checkHistory(word + letters[l]);
            if (addition) {
                yield addition;
            }
        }
    }

    /**
     * Edits
     *
     * @param {Array<string>} words
     * @param {string} letters
     * @param {Object} [ignoreMap={}]
     * @param {number} minLength
     * @yield {string}
     */
    static* reEdits(words, letters, ignoreMap = {}, minLength = this.minWordLength) {
        const history = Object.assign({}, ignoreMap);
        words.forEach(w => Object.assign(history, {[w]: true}));
        const checkHistory = value => {
            if (!history[value] && value.length >= minLength){
                history[value] = true;
                return value;
            }
        };
        for (let edit of words) {
            if (edit.length >= minLength) {
                for (let edit2 of this.edits(edit, letters, history)) {
                    const value = checkHistory(edit2);
                    if (value) {
                        yield value;
                    }
                }
            }
        }
    }

    /**
     *Creates an instance of SpellCorrector.
     * @param {string} [dbUrl=DEFAULT_DB_ADDRESS]
     * @param {string} [dbName=DEFAULT_DB_NAME]
     */
    constructor(dbUrl = DEFAULT_DB_ADDRESS, dbName = DEFAULT_DB_NAME) {
        Object.assign(this, {dbUrl, dbName});
    }

    /**
     * Probability
     *
     * @param {string} word
     * @returns {number}
     */
    async probability(word){
        const client = await MongoClient.connect(this.dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });
        const wordsCollection = client.db(this.dbName).collection('words');
        let probability = 0;
        const findResult = await wordsCollection.findOne({word}, { word:1 });
        if (findResult) {
            probability = findResult.probability;
        }
        client.close();
        return probability;
    }

    /**
     * Correction
     *
     * @param {string} inputWord
     * @returns {string}
     */
    async correction(inputWord) {
        if (typeof inputWord !== 'string') {
            return;
        }
        const targetWord = inputWord.trim().replace(new RegExp(`[${this.constructor.symbolPattern}]+`, 'igmu'), '');
        if (targetWord.length < this.constructor.minWordLength) {
            return inputWord;
        }
        const client = await MongoClient.connect(this.dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });
        const wordsCollection = client.db(this.dbName).collection('words');
        let correctedWord = targetWord;
        const findResult = await wordsCollection.findOne({word: targetWord}, { word:1 });
        if (!findResult) {
            const pipeLine = word => [
                {$match:{'mistakes.mistake': word}}
                ,{$project: {word:1, probability:1, 'mistake': {$filter: {input:'$mistakes', as: 'mistake', cond: {$eq: ['$$mistake.mistake', word]}}}}}
                ,{$unwind: '$mistake'}
                ,{$project: {word:1, weightProbability: {$divide: ['$probability', '$mistake.weight']}}}
                ,{$sort: {weightProbability:-1}}
                ,{$limit: 1}
            ];
            const [result] = await wordsCollection.aggregate(pipeLine(targetWord)).toArray();
            if (result) {
                correctedWord = result.word;
            }
        }

        client.close();
        return correctedWord;
    }
}
module.exports = MongoSpellCorrector;