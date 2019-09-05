const path = require('path');

module.exports = {
    entry: './src/spell-corrector.js',
    mode: 'production',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'spell-corrector.min.js',
        library: 'spellCorrector',
        libraryTarget: 'umd',
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    }
};