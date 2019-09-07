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
                const edits1 = Array.from(this.edits1(word, letters, ignoreMap))
                    .map(mistake => ({
                        mistake,
                        weight: mistake.length === word.length ? 1.2 : 1 
                    }));
                const edits2 = Array.from(this.edits2(word, letters, ignoreMap))
                    .map(mistake => ({
                        mistake,
                        weight: mistake.length === word.length ? 2.4 : Math.abs(mistake.length - word.length) === 1 ? 2.2 : 2 
                    }));
                let mistakes;
                if (edits2.length > 1) {
                    const edits3 = Array.from(this.edits3(word, letters, ignoreMap))
                        .map(mistake => {
                            const lenDiff = Math.abs(mistake.length - word.length);
                            return {
                                mistake,
                                weight: mistake.length === word.length ? 3.6 : lenDiff === 1 ? 3.4 : lenDiff === 2 ? 3.2 : 3 
                            };
                        });
                    if (edits3.length > 1) {
                        mistakes = edits1.concat(edits2);
                    } else {
                        mistakes = edits1.concat(edits2).concat(edits3);
                    }
                } else {
                    mistakes = edits1;
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
    static* edits1(word, letters = ['*'], ignoreMap = {}) {
        const history = { [word]: true };
        const checkHistory = value => {
            if (!history[value] && !ignoreMap[value]){
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
     * @param {string} word
     * @param {string} letters
     * @param {Object} [ignoreMap={}]
     * @yield {string}
     */
    static* edits2(word, letters, ignoreMap = {}) {
        if (word.length < this.minWordLength + 1) {
            return;
        }
        const history = { [word]: true };
        const checkHistory = value => {
            if (!history[value] && !ignoreMap[value]){
                history[value] = true;
                return value;
            }
        };
        for (let edit1 of this.edits1(word, letters, history)) {
            history[edit1] = true;
            for (let edit2 of this.edits1(edit1, letters, history)) {
                const value = checkHistory(edit2);
                if (value) {
                    yield value;
                }
            }
        }
    }

    /**
     * Edits
     *
     * @param {string} word
     * @param {string} letters
     * @param {Object} [ignoreMap={}]
     * @yield {string}
     */
    static* edits3(word, letters, ignoreMap = {}) {
        if (word.length < this.minWordLength + 2) {
            return;
        }
        const history = { [word]: true };
        const checkHistory = value => {
            if (!history[value] && !ignoreMap[value]){
                history[value] = true;
                return value;
            }
        };
        for (let edit2 of this.edits1(word, letters, history)) {
            history[edit2] = true;
            for (let edit3 of this.edits1(edit2, letters, history)) {
                const value = checkHistory(edit3);
                if (value) {
                    yield value;
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
        if (targetWord.length < 3) {
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
            /*
            const pipeLine = wList => [
                {$match:{'mistakes.mistake': {$in: wList}}}
                ,{$project: {word:1, probability:1, 'mistake': {$filter: {input:'$mistakes', as: 'mistake', cond: {$in: ['$$mistake.mistake', wList]}}}}}
                ,{$unwind: '$mistake'}
                ,{$project: {word:1, probability:1, mistake: '$mistake.mistake', weight: '$mistake.weight', weightProbability: {$divide: ['$probability', '$mistake.weight']}}}
                ,{$sort: {weightProbability:-1}}
                ,{$limit: 1}
            ];
            const [mistakeResult] = await wordsCollection.aggregate(pipeLine([targetWord])).toArray();
            if (mistakeResult) {
                correctedWord = mistakeResult.word;
            } else {
                const edits1 = Array.from(this.constructor.edits1(targetWord));
                const [mistakeEditResult] = await wordsCollection.aggregate(pipeLine(edits1)).toArray();
                if (mistakeEditResult) {
                    correctedWord = mistakeEditResult.word;
                } else {
                    const edits2 = Array.from(this.constructor.edits2(targetWord)).filter(v => !edits1.includes(v));
                    const [mistakeEdit2Result] = await wordsCollection.aggregate(pipeLine(edits2)).toArray();
                    if (mistakeEdit2Result) {
                        correctedWord = mistakeEdit2Result.word;
                    }
                }
            }
            */
        }

        client.close();
        return correctedWord;
    }
}
module.exports = MongoSpellCorrector;