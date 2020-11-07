/* eslint-env es6 */

const BFactory = artifacts.require('BFactory');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const BPool = artifacts.require('BPool');
const truffleAssert = require('truffle-assertions');
const { time } = require('@openzeppelin/test-helpers');
const { AddressZero } = require('ethers/constants');
const { assert } = require('chai');

errorBound = 0.000001
function errorCheck(input, target, _errorBound)  {
    if (target==0) {
        if (input == target) {
            assert.isTrue(true)
        }
        else {
            assert.isTrue(false)
        }
    }
    error = Math.abs( (input - target) / target )
    assert.isTrue(error < _errorBound);
    // return error
}

contract('swap fee tests - payout triggers', async (accounts) => {
    const { toWei, fromWei } = web3.utils;
    const MAX = web3.utils.toTwosComplement(-1);

    const admin = accounts[0];
    const user1 = accounts[1];

    // let crpFactory;
    let bFactory;
    let bPoolAddr;
    let bPool;
    let crpPool;
    let weth;
    let dai;
    let xyz;
    let tokens;
    let tokenAddresses;


    // Define pool params
    const swapFee = toWei('0.003');
    const startWeights = [toWei('1'), toWei('1')];
    const startBalances = [toWei('100'), toWei('100')];
    const SYMBOL = 'APT';
    const NAME = 'Alpaca Pool Token';
    // Set feeTo and pct
    feeTo = accounts[2];
    feeToPct = toWei('0.4');


    before(async () => {
        console.log('Before')


        console.log('Get initial tokens')

        xyz = await TToken.new('XYZ', 'XYZ', 18);
        weth = await TToken.new('Wrapped Ether', 'WETH', 18);
        dai = await TToken.new('Dai Stablecoin', 'DAI', 18);
        
        console.log('Mint new test tokens')
        // admin balances
        await weth.mint(admin, toWei('500'));
        await dai.mint(admin, toWei('45000'));
        await xyz.mint(admin, toWei('300000'));
        // user balances
        await weth.mint(user1, toWei('600'));
        await dai.mint(user1, toWei('10000'));
        await xyz.mint(user1, toWei('12000'));
    
        tokens = [xyz, weth]
        tokenAddresses = tokens.map(function(t) {return t.address})

        const permissions = {
            canPauseSwapping: true,
            canChangeSwapFee: true,
            canChangeWeights: true,
            canAddRemoveTokens: true,
            canWhitelistLPs: false,
            canChangeCap: false,
        };
    
        // construct param object
        const poolParams = {
            poolTokenSymbol: SYMBOL,
            poolTokenName: NAME,
            constituentTokens: tokenAddresses,
            tokenBalances: startBalances,
            tokenWeights: startWeights,
            swapFee: swapFee,
        };
    
        bFactory = await BFactory.deployed();
    
        // Create CR Pool
        console.log('Create CRPool')
        crpPool = await ConfigurableRightsPool.new(
            bFactory.address,
            poolParams,
            permissions,
        );
    
        // Approve initial assets for deposit
        console.log('Approve tokens for CRPool construction');
        for (var token of tokens) {
            await token.approve(crpPool.address, MAX);
        }
        
        // Create initial CRP pool
        console.log('Create initial CRP pool');
        await crpPool.createPool(toWei('100'));
        bPoolAddr = await crpPool.bPool();
        bPool = await BPool.at(bPoolAddr);
    
        for (var token of tokens) {
            await token.approve(bPool.address, MAX, { from: user1 });
        }

        await crpPool.setFeeTo(feeTo);
        await crpPool.setFracFeePaidOut(feeToPct);
    });

    describe('Test different mint fee triggers', () => {
        it('Initial fracPoolFees should be 0', async () => {
            fracPoolFees = await bPool.getFracPoolFees();
            assert.equal(fromWei(fracPoolFees), 0)
        });

        it('mintFee should trigger _mintFee', async () => {
            // Do a few test swaps
            console.log('\nTest Swap 1')

            /*
                function swapExactAmountIn(
                    address tokenIn,
                    uint tokenAmountIn,
                    address tokenOut,
                    uint minAmountOut,
                    uint maxPrice
                ) 
            */    
            result = await bPool.swapExactAmountIn(
                tokenAddresses[0],
                toWei('50'), // tokenAmountIn
                tokenAddresses[1],
                toWei('0'), // minAmountOut
                MAX,
                { from: user1 },
            );
            // console.log(`Test Trade Amount Out (should be 33.266...): ${fromWei(result[0])}`)  // '33.2665999332665999'
            tokenAmountOut = result.logs[0]['args']['tokenAmountOut'];
            console.log(`Test Trade Amount Out: ${fromWei(result.logs[0]['args']['tokenAmountOut'])}`)
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)     // should be 0.0005

            errorCheck(fromWei(tokenAmountOut), 33.2665999332665999, errorBound);
            errorCheck(fromWei(fracPoolFees), 0.0005, errorBound);

            // trigger a _mintFee() call
            await crpPool.mintFee({ from: user1 });
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)     // should be 0
            assert.equal(fromWei(fracPoolFees), 0);
        });

        it('setFeeTo should trigger _mintFee', async () => {

            console.log('\nTest Swap 2')
            result = await bPool.swapExactAmountIn(tokenAddresses[1], toWei('25'), tokenAddresses[0], toWei('0'), MAX, { from: user1 },);
            console.log(`Test Trade Amount Out: ${fromWei(result.logs[0]['args']['tokenAmountOut'])}`)
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

            // trigger a _mintFee() call
            await crpPool.setFeeTo(feeTo);
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)     // should be 0
            assert.equal(fromWei(fracPoolFees), 0);
        });

        it('setFracFeePaidOut should trigger _mintFee', async () => {

            console.log('\nTest Swap 3')
            result = await bPool.swapExactAmountIn(tokenAddresses[1], toWei('30'), tokenAddresses[0], toWei('0'), MAX, { from: user1 },);
            console.log(`Test Trade Amount Out: ${fromWei(result.logs[0]['args']['tokenAmountOut'])}`)
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

            // trigger a _mintFee() call
            await crpPool.setFracFeePaidOut(feeToPct);
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)
            assert.equal(fromWei(fracPoolFees), 0);
        });

        it('setSwapFee should trigger _mintFee', async () => {

            console.log('\nTest Swap 4')
            result = await bPool.swapExactAmountIn(tokenAddresses[0], toWei('40'), tokenAddresses[1], toWei('0'), MAX, { from: user1 },);
            console.log(`Test Trade Amount Out: ${fromWei(result.logs[0]['args']['tokenAmountOut'])}`)
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

            // trigger a _mintFee() call
            await crpPool.setSwapFee(swapFee);
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)
            assert.equal(fromWei(fracPoolFees), 0);
        });

        it('feeTo recipient should have proper ownership of pool', async () => {
            adminBPTBalance = await crpPool.balanceOf.call(admin);
            feeToBPTBalance = await crpPool.balanceOf.call(feeTo);
            totalSupply = await crpPool.totalSupply()
            console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
            console.log(`feeToBPTBalance: ${fromWei(feeToBPTBalance)}`);
            console.log(`Frac pool owned by feeTo address: ${feeToBPTBalance/totalSupply}`) // should be near 0.0007070617987467339 (will be 0.0007073418252907806 due to path dependency)

            errorCheck(feeToBPTBalance/totalSupply, 0.0007070617987467339, 0.001)
        });
    });
});