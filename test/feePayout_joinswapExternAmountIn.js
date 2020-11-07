/* eslint-env es6 */

const BFactory = artifacts.require('BFactory');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const BPool = artifacts.require('BPool');
const truffleAssert = require('truffle-assertions');
const { time } = require('@openzeppelin/test-helpers');
const { AddressZero } = require('ethers/constants');

errorBound = 0.000001
function errorCheck(input, target) {
    error = Math.abs( (input - target) / target )
    assert.isTrue(error < errorBound);
    // return error
}

contract('swap fee tests - joinswapExternAmountIn', async (accounts) => {
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
    const startWeights = [toWei('2'), toWei('3'), toWei('5')];
    const startBalances = [toWei('30'), toWei('100'), toWei('200')];
    const SYMBOL = 'APT';
    const NAME = 'Alpaca Pool Token';
    // Set feeTo and pct
    feeTo = accounts[2];
    feeToPct = toWei('0.4');


    before(async () => {
        xyz = await TToken.new('XYZ', 'XYZ', 18);
        weth = await TToken.new('Wrapped Ether', 'WETH', 18);
        dai = await TToken.new('Dai Stablecoin', 'DAI', 18);
        
        // admin balances
        await weth.mint(admin, toWei('500'));
        await dai.mint(admin, toWei('45000'));
        await xyz.mint(admin, toWei('300000'));
        // user balances
        await weth.mint(user1, toWei('600'));
        await dai.mint(user1, toWei('10000'));
        await xyz.mint(user1, toWei('12000'));
    
        tokens = [xyz, weth, dai]
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
        crpPool = await ConfigurableRightsPool.new(
            bFactory.address,
            poolParams,
            permissions,
        );
    
        // Approve initial assets for deposit
        for (var token of tokens) {
            await token.approve(crpPool.address, MAX);
        }
        
        // Create initial CRP pool
        await crpPool.createPool(toWei('100'));
        bPoolAddr = await crpPool.bPool();
        bPool = await BPool.at(bPoolAddr);

        for (var token of tokens) {
            await token.approve(bPool.address, MAX, { from: user1 });
            await token.approve(crpPool.address, MAX, { from: user1 });
        }

        await crpPool.setFeeTo(feeTo);
        await crpPool.setFracFeePaidOut(feeToPct);
    });

    describe('Test joinswapExternAmountIn with fee payout', () => {
        it('Test Join should give right share of pool fees', async () => {
            // function joinswapExternAmountIn(
            //     address tokenIn,
            //     uint tokenAmountIn,
            //     uint minPoolAmountOut
            // )
            result = await crpPool.joinswapExternAmountIn(
                tokenAddresses[0],
                toWei('10'), 
                toWei('0'),
                { from: user1 },
            );
            tokenAmountIn = result.logs[0]['args']['tokenAmountIn'];
            console.log(`Token Amount Out: ${fromWei(tokenAmountIn)}`)    
            user1BPTBalance = await crpPool.balanceOf.call(user1);      // should be 5.9096703681414132
            console.log(`user1BPTBalance: ${fromWei(user1BPTBalance)}`);
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)     // should be 0.00012

            errorCheck(fromWei(user1BPTBalance), 5.9096703681414132);
            errorCheck(fromWei(fracPoolFees), 0.00012);
 
        });

        it('Trigger mint fee should reset fracPoolFees', async () => {
            // trigger a _mintFee() call
            console.log('\nTrigger _mintFee()')
            await crpPool.mintFee({ from: user1 });

            fracPoolFees = await bPool.getFracPoolFees();
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

            assert.equal(fromWei(fracPoolFees), 0);
        });
        
        it('feeTo recipient should have proper ownership of pool', async () => {
            adminBPTBalance = await crpPool.balanceOf.call(admin);
            feeToBPTBalance = await crpPool.balanceOf.call(feeTo);
            totalSupply = await crpPool.totalSupply()
            console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
            console.log(`feeToBPTBalance: ${fromWei(feeToBPTBalance)}`);
            console.log(`Frac pool owned by feeTo address: ${feeToBPTBalance/totalSupply}`) // should be 0.000048

            errorCheck(feeToBPTBalance/totalSupply, 0.000048)
        });

    });
});
