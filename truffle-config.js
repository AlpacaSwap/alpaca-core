const HDWalletProvider = require("@truffle/hdwallet-provider");
const fs = require('fs');

const mnemonic = '';

const endpointUrl_kovan = '';
const endpointUrl_ropsten = '';
const endpointUrl_mainnet = '';


module.exports = {
    networks: {
        development: {
            host: 'localhost',  // Localhost (default: none)
            port: 8545,         // Standard Ethereum port (default: none)
            network_id: '*',    // Any network (default: none)
            gas: 10000000,
            gasPrice: 50e9
        },
        coverage: {
            host: 'localhost',
            network_id: '*',
            port: 8555,
            gas: 0xfffffffffff,
            gasPrice: 0x01,
        },
        kovan: {
            provider: function() {
              return new HDWalletProvider(
                //private keys array
                mnemonic,
                //url to ethereum node
                endpointUrl_kovan
              )
            },
            gas: 7900000,
            gasPrice: 1e9,
            network_id: 42
        },
        ropsten: {
            provider: function() {
              return new HDWalletProvider(mnemonic, endpointUrl_ropsten)
            },
            gas: 7900000,
            gasPrice: 40e9,
            network_id: 3
        },
        mainnet: {
            provider: () => new HDWalletProvider(mnemonic, endpointUrl_mainnet),
            network_id: 1,
            gas: 12000000,
            timeoutBlocks: 500,
            gasPrice: 50e9, // 50 Gwei
        },
    },
    // Configure your compilers
    compilers: {
        solc: {
            version: '0.6.12',
            settings: { // See the solidity docs for advice about optimization and evmVersion
                optimizer: {
                    enabled: true,
                    runs: 200,
                },
                evmVersion: 'istanbul',
            },
        },
    },
    plugins: [
        "truffle-contract-size",
        "truffle-plugin-verify",
    ]
};
