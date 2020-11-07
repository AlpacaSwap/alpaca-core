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

contract('swap fee tests - swapExactAmountIn', async (accounts) => {
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
    });

    describe('Test CRP and BPool permissions', () => {

        // it('_mintFee should not be callable', async () => {
        //     chai.expect(manager.test.bind(manager)).to.throw('Oh no')
        //     await truffleAssert.reverts(
        //         crpPool._mintFee(),
        //         'ERR_NOT_CONTROLLER',
        //     );
        //     TypeError
        // });

        it('Non-controller should not be able to set feeTo address', async () => {
            await truffleAssert.reverts(
                crpPool.setFeeTo(user1, { from: user1 }),
                'ERR_NOT_CONTROLLER',
            );
        });

        it('Non-controller should not be able to set fracFeePaidOut', async () => {
            await truffleAssert.reverts(
                crpPool.setFracFeePaidOut(toWei('0.5'), { from: user1 }),
                'ERR_NOT_CONTROLLER',
            );
        });

        it('Non-controller should not be able to set exitFeeTo', async () => {
            await truffleAssert.reverts(
                crpPool.setExitFeeTo(user1, { from: user1 }),
                'ERR_NOT_CONTROLLER',
            );
        });

        it('Should not be able to call bPool.updateFracPoolFees', async () => {
            await truffleAssert.reverts(
                bPool.updateFracPoolFees(toWei('0.5')),
                'ERR_NOT_CONTROLLER',
            );
        });

        // it('Should not be able to call bPool._updateFracPoolFees', async () => {
        //     await truffleAssert.reverts(
        //         bPool._updateFracPoolFees(toWei('0.5')),
        //         'ERR_NOT_CONTROLLER',
        //     );
        // });

        it('Non-controller should not be able to call setFracFeePaidOut', async () => {
            await truffleAssert.reverts(
                crpPool.setPayoutToken(tokenAddresses[1], { from: user1 }),
                'ERR_NOT_CONTROLLER',
            );
        });

        // Ensure that the modifiable variables can be changed
        it('Controller should be able to call setFeeTo', async () => {
            await crpPool.setFeeTo(admin);
        });

        it('Controller should be able to call setFeeTo', async () => {
            await crpPool.setFracFeePaidOut(feeToPct);
        });

        it('Controller should be able to call setPayoutToken', async () => {
            await crpPool.setPayoutToken(tokenAddresses[0]);
        });

        it('Controller should be able to call setExitFeeTo', async () => {
            await crpPool.setExitFeeTo(admin);
        });

    });
});
