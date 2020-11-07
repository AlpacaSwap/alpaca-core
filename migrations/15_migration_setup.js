// Helper functions
const { expectRevert, time } = require('@openzeppelin/test-helpers');
// const { AddressZero } = require('ethers/constants');

// Core
const AlpacaToken = artifacts.require('AlpacaToken');
const MockERC20 = artifacts.require("MockERC20");

// Rancher
const MasterRancher = artifacts.require('MasterRancher');

//uniswap
const UniswapV2ERC20 = artifacts.require('UniswapV2ERC20');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');
const WETH = artifacts.require('WETH9');
const StakingRewards = artifacts.require('StakingRewards');

// Utils
const {toWei, fromWei} = web3.utils;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";


// Deployer
module.exports = async function (deployer, network, accounts) {
    const admin = accounts[0];
    const user1 = accounts[1];

    let lps = [];
    let lpsIncluded = [];
    let lpAddresses = {};
    let uspAddresses = {};

    let weth; 
    let wbtc; 
    let usdc; 
    let dai;  
    let usdt; 
    let paca; 
    let uni;  

    lps = [
        'WBTC-WETH',
        'USDC-WETH',
         'DAI-WETH',
        'USDT-WETH',
        'PACA-WETH',
        'UNI-WETH',
    ];

    lpsIncluded = {     // LPs to include in MasterRancher
        'WBTC-WETH' : true,
        'USDC-WETH' : true,
         'DAI-WETH' : true,
        'USDT-WETH' : true,
        'PACA-WETH' : true,
         'UNI-WETH' : false,
    };

    lpsAllocPoints = {     // weighting of pool rewards in MasterRancher
        'WBTC-WETH' : '10',
        'USDC-WETH' : '10',
         'DAI-WETH' : '10',
        'USDT-WETH' : '10',
        'PACA-WETH' : '20',
         'UNI-WETH' : '00',
    };
    
    if (network == 'mainnet') {
    // if (network == 'development') {
        console.log('mainnet');

        weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        wbtc = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
        usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
        dai  = '0x6b175474e89094c44da98b954eedeac495271d0f';
        usdt = '0xdac17f958d2ee523a2206206994597c13d831ec7';
        // paca = ZERO_ADDRESS;
        paca = (await AlpacaToken.deployed()).address;
        uni  = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
        uniAddr = uni;

        factory = await UniswapV2Factory.at('0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f')
        // lpPACA = await UniswapV2Pair.at(
        //     (await factory.createPair(weth, paca))
        //         .logs[0].args.pair
        // );
        lpPACA = await UniswapV2Pair.at('0x99cd83d4d229818451e5fe83e12dd5805e1a8218')

        lpAddresses = {
            'WBTC-WETH' : '0xbb2b8038a1640196fbe3e38816f3e67cba72d940',
            'USDC-WETH' : '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
             'DAI-WETH' : '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11',
            'USDT-WETH' : '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852',
            'PACA-WETH' : lpPACA.address,
             'UNI-WETH' : '0xd3d2e2692501a5c9ca623199d38826e513033a17',
        };

        uspAddresses = {
            'WBTC-WETH' : '0xCA35e32e7926b96A9988f61d510E038108d8068e',
            'USDC-WETH' : '0x7FBa4B8Dc5E7616e59622806932DBea72537A56b',
             'DAI-WETH' : '0xa1484C3aa22a66C62b77E0AE78E15258bd0cB711',
            'USDT-WETH' : '0x6c3e4cb2e96b01f4b866965a91ed4437839a121a',
            'PACA-WETH' : ZERO_ADDRESS,
             'UNI-WETH' : ZERO_ADDRESS,
        };
    }
    else {
        console.log('development');

        // create ERC20 tokens for Uniswap pairs
        weth = await MockERC20.new("WETH", "WETH", toWei("100000000"));
        usdt = await MockERC20.new("USDT", "USDT", toWei("1000000"));
        usdc = await MockERC20.new("USDC", "USDC", toWei("1000000"));
        dai  = await MockERC20.new("DAI", "DAI", toWei("1000000"));
        wbtc = await MockERC20.new("WBTC", "WBTC", toWei("1000000"));
        paca = await AlpacaToken.deployed();
        uni  = await MockERC20.new("UNI", "UNI", toWei("1000000"));
        uniAddr = uni.address;

        // Print addresses
        console.log(`\n\nAddresses`);
        console.log(`\nTokens:`);
        console.log(`weth: ${weth.address}`);
        console.log(`usdt: ${usdt.address}`);
        console.log(`usdc: ${usdc.address}`);
        console.log(`dai: ${dai.address}`);
        console.log(`wbtc: ${wbtc.address}`);
        console.log(`PACA: ${paca.address}`);
        console.log(`UNI: ${uni.address}`);

        // await paca.mint(admin, toWei('1000000'));

        // Create Uniswap pairs
        // factory1 = await UniswapV2Factory.new(admin, {from: admin});
        factory1 = await UniswapV2Factory.deployed();
        lpWBTC = await UniswapV2Pair.at(
            (await factory1.createPair(weth.address, wbtc.address))
                .logs[0].args.pair
        );
        lpUSDC = await UniswapV2Pair.at(
            (await factory1.createPair(weth.address, usdc.address))
                .logs[0].args.pair
        );
        lpDAI = await UniswapV2Pair.at(
            (await factory1.createPair(weth.address, dai.address))
                .logs[0].args.pair
        );
        lpUSDT = await UniswapV2Pair.at(
            (await factory1.createPair(weth.address, usdt.address))
                .logs[0].args.pair
        );
        lpPACA = await UniswapV2Pair.at(
            (await factory1.createPair(weth.address, paca.address))
                .logs[0].args.pair
        );
        lpUNI = await UniswapV2Pair.at(
            (await factory1.createPair(weth.address, uni.address))
                .logs[0].args.pair
        );

        if (true) {
            await wbtc.transfer(lpWBTC.address, toWei("100000"));
            await weth.transfer(lpWBTC.address, toWei("100000"));
            await lpWBTC.mint(admin);

            await usdc.transfer(lpUSDC.address, toWei("200000"));
            await weth.transfer(lpUSDC.address, toWei("100000"));
            await lpUSDC.mint(admin);

            await dai.transfer(lpDAI.address, toWei("400000"));
            await weth.transfer(lpDAI.address, toWei("100000"));
            await lpDAI.mint(admin);

            await usdt.transfer(lpUSDT.address, toWei("800000"));
            await weth.transfer(lpUSDT.address, toWei("100000"));
            await lpUSDT.mint(admin);

            await uni.transfer(lpUNI.address, toWei("800000"));
            await weth.transfer(lpUNI.address, toWei("100000"));
            await lpUNI.mint(admin);
        }

        // Create UNI staking pools
        uspWBTC = await StakingRewards.new(admin, uni.address, lpWBTC.address);
        uspUSDC = await StakingRewards.new(admin, uni.address, lpUSDC.address);
        uspDAI  = await StakingRewards.new(admin, uni.address, lpDAI.address);
        uspUSDT = await StakingRewards.new(admin, uni.address, lpUSDT.address);

        lpAddresses = {
            'WBTC-WETH' : lpWBTC.address,
            'USDC-WETH' : lpUSDC.address,
             'DAI-WETH' : lpDAI.address,
            'USDT-WETH' : lpUSDT.address,
            'PACA-WETH' : lpPACA.address,
             'UNI-WETH' : lpUNI.address,
        };

        uspAddresses = {
            'WBTC-WETH' : uspWBTC.address,
            'USDC-WETH' : uspUSDC.address,
             'DAI-WETH' : uspDAI.address,
            'USDT-WETH' : uspUSDT.address,
            'PACA-WETH' : ZERO_ADDRESS,
             'UNI-WETH' : ZERO_ADDRESS,
        };
    }

    // Add Uniswap LP pools to MasterRancher
    const ranch = await MasterRancher.deployed();
    console.log(`\nMasterRancher at ${ranch.address}`);
    await ranch.setUNI(uniAddr);

    for (let i = 0; i < lps.length; i++) {
        lp = lps[i];
        if (lpsIncluded[lp]) {
            await ranch.add(
                lpsAllocPoints[lp],
                lpAddresses[lp],
                true,
                uspAddresses[lp]
            );
            console.log(`\nAdded LP: ${lp}`);
            console.log(`   AllocPoints: ${lpsAllocPoints[lp]}`);
            console.log(`   LP Address:  ${lpAddresses[lp]}`);
            console.log(`   USP Address: ${uspAddresses[lp]}`);
        }
    }
};
