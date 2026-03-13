//@ts-check
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
const clientConfig = {
  target: 'node',
  mode: 'none',
  entry: './client/src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist', 'client'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'client', 'tsconfig.json')
            }
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map'
};

/** @type {import('webpack').Configuration} */
const serverConfig = {
  target: 'node',
  mode: 'none',
  entry: './server/src/server.ts',
  output: {
    path: path.resolve(__dirname, 'dist', 'server'),
    filename: 'server.js',
    libraryTarget: 'commonjs2'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'server', 'tsconfig.json')
            }
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map'
};

module.exports = [clientConfig, serverConfig];
