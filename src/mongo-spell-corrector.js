const MongoClient = require('mongodb').MongoClient;

const DEFAULT_DB_ADDRESS = 'mongodb://localhost:27017';
const DEFAULT_DB_NAME = 'spellchecker';
const DEFAULT_LOCALE = 'en_us';

class MongoSpellCorrector {

    /**
     * Db Init and feed
     *
     * @static
     * @param {string} fileName
     * @param {string} [dbUrl=DEFAULT_DB_ADDRESS]
     * @param {string} [dbName=DEFAULT_DB_NAME]
     * @param {string} [locale=DEFAULT_LOCALE]
     * @returns {Promise}
     * @memberof MongoSpellCorrector
     */
    static initializer(fileName, dbUrl = DEFAULT_DB_ADDRESS, dbName = DEFAULT_DB_NAME, locale = DEFAULT_LOCALE) {
        const cluster = require('cluster');

        //Master process
        if (cluster.isMaster) {
            return new Promise(async (mainResolve, mainReject) => {
                // Reading source file
                const { queue, letters, ignoreList } = (({ ranking, checkList, letters }) => ({
                    queue: ranking,
                    letters,
                    ignoreList: checkList
                }))(this.fileToDictionary(fileName));

                const totalWords = queue.length;
                //Initializing DB

                const client = await MongoClient.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });
                try {
                    const db = client.db(dbName);
                    // Cleaning up target collection using locale as collectionName
                    await db.listCollections({name: locale}).toArray().then((collections) => Promise.all(collections.map(({name}) => db.dropCollection(name))));
                    
                    //Creating collection
                    await db.createCollection(locale);
                    const wordsCollection = db.collection(locale);
                    //Creating indexes for collection
                    await wordsCollection.createIndex({ word:1 }, { unique: true });
                    await wordsCollection.createIndex({ 'mistakes.mistake':1 });


                    //Clustering
                    //Forking process for each system cpu
                    const os = require('os');
                    os.cpus().forEach(() => cluster.fork());
                    const unqueue = worker => {
                        if (queue.length) {
                            //unqueueing next word to process
                            const word = queue.shift();
                            
                            // Assigning tasks to workers
                            worker.send({
                                word,
                                letters,
                                ignoreList
                            });
                        } else {
                            //killing worker
                            worker.send();
                        }
                    };
                    const checkJobComplete = () => {
                        if (!queue.length && !Object.keys(cluster.workers).length) {
                            //Queue is empty and no workers are working
                            // eslint-disable-next-line no-console
                            console.log('COMPLETE');
                            // closing connection
                            client.close().then(mainResolve);
                        }
                    };
                    const startDt = new Date();
                    Object.values(cluster.workers).forEach(worker => {
                        unqueue(worker);
                        worker.on('message', async (document) => {
                            if (document) {
                                const progressDt = new Date();
                                unqueue(worker);
                                await wordsCollection.insertOne(document);
                                const completed = totalWords - queue.length - Object.keys(cluster.workers).length - 1;
                                const progress = Math.round(completed * 1000 / totalWords)/10;
                                const perc = (progress + '').split('.').map((v, i, a) => a.length===1 || !i ? v.padStart(3, '  0') : v).join('.').padEnd(5,'.0');
                                // eslint-disable-next-line no-console
                                console.log(`Progress: ${perc}% - ${completed} / ${totalWords} - avg: ${Math.round((progressDt-startDt)/completed)/1000}s/word`);
                            }
                        });
                        worker.on('exit', ({id}, code) => {
                            if (code) {
                                // eslint-disable-next-line no-console
                                console.log(`Worker ${id} crashed. Restarting...`);
                                if (queue.length) {
                                    unqueue(cluster.fork());
                                }
                            } else {
                                checkJobComplete();
                            }
                        });
                    });
                } catch(e) {
                    // closing db connection before throwing error
                    await client.close();
                    mainReject(e);
                }
            });
        } else {    //Threads
            return this.documentGenerator()
                .then(() => process.exit(0))
                .catch((err) => {
                    // eslint-disable-next-line no-console
                    console.error(`Thread ${process.pid} error:`, err);
                    process.exit(1);
                });
        }
    }

    /**
     * @static
     * @returns {Promise}
     * @memberof MongoSpellCorrector
     */
    static documentGenerator() {
        return new Promise((forkResolve, forkReject) => {
            process.on('message', message => {
                if (message) {
                    const { word: {word, rank, count, probability}, letters, ignoreList } = message;
                    try {
                        const edits1 = Array.from(this.edits(word, letters))
                            .filter((m, i, l) => l.indexOf(m) === i && !ignoreList[m]);
                        const mistakes1 = edits1
                            .map(mistake => ({
                                mistake,
                                weight: mistake.length === word.length ? 1.2 : 1 
                            }));
                        const edits2 = Array.from(this.reEdits(edits1, letters))
                            .filter((m, i, l) => l.indexOf(m) === i && !ignoreList[m] && !edits1.includes(m));
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
        
                        process.send({
                            word,
                            rank,
                            count,
                            probability,
                            mistakes
                        });
                        // eslint-disable-next-line no-console
                        console.log(`Thread ${process.pid} task complete: ${word}, listening for new activity...`);
                    } catch (err) {
                        forkReject(err);
                    }
                } else {
                    forkResolve();
                }
            });
        });
    }

    /**
     * Db Init and feed
     *
     * @static
     * @param {string} fileName
     * @returns {Object} { ranking, checkList, letters }
     * @memberof MongoSpellCorrector
     */
    static fileToDictionary(fileName) {
        const fs = require('fs');
        const text = fs.readFileSync(fileName, 'utf8');
        const wordList = this.words(text);
        const wordsTotalCount = wordList.length;
        const wordsMap = {};
        const checkList = {};
        wordList.forEach(word => {
            if (checkList[word]) {
                wordsMap[word].count++;
            } else {
                wordsMap[word] = {
                    word,
                    count: 1
                };
                checkList[word] = true;
            }
        });

        const ranking = Object.values(wordsMap)
            .sort((w1, w2) => w1.count > w2.count ? -1 : w2.count > w1.count ? 1 : 0);
        let letters = '';
        ranking.forEach((targetWord, rank) => {
            Object.assign(targetWord, {
                rank,
                probability: targetWord.count / wordsTotalCount
            });
            targetWord.word.split('').forEach(c => {
                if (!letters.includes(c) && letters !== '_') {
                    letters += c;
                }
            });
        });

        return {
            ranking,
            checkList,
            letters
        };
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
    static* edits(word, letters = ['*']) {
        for (let i = 0; i < word.length; i++) {
            const leftSlice = word.substring(0, i);
            const rightSlice = word.substring(i + 1);
            
            yield leftSlice + rightSlice;
            if (i < word.length -1) {
                yield leftSlice + word[i + 1] + word[i] + rightSlice.substring(1);
            }
            for (let l = 0; l < letters.length; l++) {
                const c = letters[l];
                if (c !== word[i]) {
                    yield leftSlice + c + rightSlice;
                }
                yield leftSlice + c + word[i] + rightSlice;
            }
        }
        for (let l = 0; l < letters.length; l++) {
            yield word + letters[l];
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
    static* reEdits(words, letters) {
        for (let edit of words) {
            yield* this.edits(edit, letters);
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