const webpack = require('webpack');
const path = require('path');
const { env } = require('yargs').argv;

const libraryName = 'CatenaContract';
const plugins = [];
let outputFile;

if (env === 'dist') {
  plugins.push(new webpack.DefinePlugin({
    'process.env': {
      NODE_ENV: JSON.stringify('production'),
    },
  }));
  plugins.push(new webpack.optimize.UglifyJsPlugin());
  outputFile = 'bundle.min.js';
} else {
  outputFile = 'bundle.js';
}

const config = {
  entry: path.join(__dirname, '/dist/index.js'),
  devtool: 'source-map',
  output: {
    path: path.join(__dirname, '/dist'),
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },
  module: {
    rules: [
      {
        test: /(\.jsx|\.js)$/,
        loader: 'babel-loader',
        exclude: /(node_modules|bower_components)/,
        options: {
          presets: ['env'],
        },
      },
      {
        test: /(\.jsx|\.js)$/,
        loader: 'eslint-loader',
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    web3: 'web3',
  },
  resolve: {
    modules: [path.resolve('./node_modules'), path.resolve('./src')],
    extensions: ['.json', '.js'],
  },
  plugins,
};

module.exports = config;
