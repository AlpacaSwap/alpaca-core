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
    return error
}

contract('exit fee tests', async (accounts) => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const { toWei, fromWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);

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
    const feeTo = accounts[2];
    const feeToPct = toWei('0.4');
    const exitFeeTo = accounts[3];
    const payoutTokenIdx = 0;

    beforeEach  (async () => {
        // let crpFactory;

        // Tokens not deployed
        xyz = await TToken.new('XYZ', 'XYZ', 18);
        weth = await TToken.new('Wrapped Ether', 'WETH', 18);
        dai = await TToken.new('Dai Stablecoin', 'DAI', 18);
        
        // console.log('Mint new test tokens')
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
        // console.log('Create CRPool')
        crpPool = await ConfigurableRightsPool.new(
            bFactory.address,
            poolParams,
            permissions,
        );

        // Approve initial assets for deposit
        // console.log('Approve tokens for CRPool construction');
        
        for (var token of tokens) {
            await token.approve(crpPool.address, MAX);
        }
        
        // Create initial CRP pool
        // console.log('Create initial CRP pool');
        await crpPool.createPool(toWei('100'));
        bPoolAddr = await crpPool.bPool();
        bPool = await BPool.at(bPoolAddr);

        // Remaining pool initialization
        await crpPool.setFeeTo(feeTo);
        await crpPool.setFracFeePaidOut(feeToPct);
        await crpPool.setPayoutToken(tokenAddresses[payoutTokenIdx]);
        await crpPool.setExitFeeTo(exitFeeTo);
        await crpPool.setExitFee(toWei('0.01'));
        // exitFee = await bPool.getExitFee();

        for (var token of tokens) {
            await token.approve(bPool.address, MAX, { from: user1 });
            await token.approve(crpPool.address, MAX, { from: user1 });
        }

        // Set fee test
        // console.log(`\nStart fee test:`)
        // fracPoolFees = await bPool.getFracPoolFees()
        // console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

        // adminBPTBalance = await crpPool.balanceOf.call(admin);
        // feeToBPTBalance = await crpPool.balanceOf.call(feeTo);
        // console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
        // console.log(`feeToBPTBalance: ${fromWei(feeToBPTBalance)}`);


        // adminBPTBalance = await crpPool.balanceOf.call(admin);
        // feeToBPTBalance = await crpPool.balanceOf.call(feeTo);
        // console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
        // console.log(`feeToBPTBalance: ${fromWei(feeToBPTBalance)}`);

        // fracPoolFees = await bPool.getFracPoolFees();
        // console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

    });



    describe('Test Exit Fee Permissions', () => {
        it('Controller should be able to set exit fee', async () => {
            exitFeeBefore = await bPool.getExitFee();
            newExitFee = toWei('0.02');
            await crpPool.setExitFee(newExitFee);
            exitFeeAfter = await bPool.getExitFee();
            
            assert.equal(exitFeeAfter, newExitFee);
            // assert.equal(controllerAddr, admin);
            // assert.isTrue(perm);
            // await truffleAssert.reverts(
            //     crpPool.createPool(toWei('0')),
            //     'ERR_INIT_SUPPLY_MIN',
            // );
        });

        it('Controller should be able to set exit fee to address', async () => {
            exitFeeToBefore = await crpPool.exitFeeTo();
            newExitFeeTo = admin;
            await crpPool.setExitFeeTo(newExitFeeTo);
            exitFeeToAfter = await crpPool.exitFeeTo();
            // console.log(`exitFeeToAfter: ${exitFeeToAfter}`);
            
            assert.equal(exitFeeToAfter, newExitFeeTo);
        });

        it('Non-controller not be able to set Exit Fee', async () => {
            await truffleAssert.reverts(
                crpPool.setExitFeeTo(user1, { from: user1 }),
                'ERR_NOT_CONTROLLER',
            );
        });

        it('Non-controller not be able to set exit fee to address', async () => {
            await truffleAssert.reverts(
                crpPool.setExitFeeTo(user1, { from: user1 }),
                'ERR_NOT_CONTROLLER',
            );
        });
    });
    
    describe('Test Exit Fee Amounts', () => {
        it('Should be able to exit pool with exit fee', async () => {
            
            // Get initial balances
            console.log('\nBalances before exit')
            bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
            bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
            bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
            console.log(`bPoolXYZBalance: ${fromWei(bPoolXYZBalance)}`)
            console.log(`bPoolWethBalance: ${fromWei(bPoolWethBalance)}`)
            console.log(`bPoolDaiBalance: ${fromWei(bPoolDaiBalance)}`)
        
            adminXYZBalance = await xyz.balanceOf.call(admin);
            adminWethBalance = await weth.balanceOf.call(admin);
            adminDaiBalance = await dai.balanceOf.call(admin);
            console.log(`adminXYZBalance: ${fromWei(adminXYZBalance)}`)
            console.log(`adminWethBalance: ${fromWei(adminWethBalance)}`)
            console.log(`adminDaiBalance: ${fromWei(adminDaiBalance)}`)
        
            // Call Exit
            console.log('\nExit call')
            // function exitPool(uint poolAmountIn, uint[] calldata minAmountsOut)
            result = await crpPool.exitPool(toWei('20'), [0, 0, 0]);
            
            // console.log(`Test Trade Amount In: ${fromWei(result.logs[0]['args']['tokenAmountOut'])}`)    // should be 6.7702841025
            adminBPTBalance = await crpPool.balanceOf.call(admin);
            console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);    // should be 80
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)     // should be 0
            
            // Get post-exit balances
            console.log('\nBalances after exit')
            bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
            bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
            bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
            console.log(`bPoolXYZBalance: ${fromWei(bPoolXYZBalance)}`)
            console.log(`bPoolWethBalance: ${fromWei(bPoolWethBalance)}`)
            console.log(`bPoolDaiBalance: ${fromWei(bPoolDaiBalance)}`)
        
            adminXYZBalance = await xyz.balanceOf.call(admin);
            adminWethBalance = await weth.balanceOf.call(admin);
            adminDaiBalance = await dai.balanceOf.call(admin);
            console.log(`adminXYZBalance: ${fromWei(adminXYZBalance)}`)
            console.log(`adminWethBalance: ${fromWei(adminWethBalance)}`)
            console.log(`adminDaiBalance: ${fromWei(adminDaiBalance)}`)
        
            // // Rejoin pool
            // // function joinPool(uint poolAmountOut, uint[] calldata maxAmountsIn)
            // result = await crpPool.joinPool(toWei('20'), [MAX, MAX, MAX]);
            // console.log('\nBalances after join')
            // bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
            // bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
            // bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
            // console.log(`bPoolXYZBalance: ${fromWei(bPoolXYZBalance)}`)
            // console.log(`bPoolWethBalance: ${fromWei(bPoolWethBalance)}`)
            // console.log(`bPoolDaiBalance: ${fromWei(bPoolDaiBalance)}`)
        
            // exitFeeTo balances
            exitFeeToXYZBalance  = await xyz.balanceOf.call(    exitFeeTo);
            exitFeeToWethBalance = await weth.balanceOf.call(   exitFeeTo);
            exitFeeToDaiBalance  = await dai.balanceOf.call(    exitFeeTo);
            exitFeeToBPTBalance  = await crpPool.balanceOf.call(exitFeeTo);
            console.log(`exitFeeToXYZBalance:  ${fromWei(exitFeeToXYZBalance)}`);
            console.log(`exitFeeToWethBalance: ${fromWei(exitFeeToWethBalance)}`);
            console.log(`exitFeeToDaiBalance:  ${fromWei(exitFeeToDaiBalance)}`);
            console.log(`exitFeeToBPTBalance:  ${fromWei(exitFeeToBPTBalance)}`);

            // error_bound = 0.00000000001
            target = 0.2
            input = fromWei(exitFeeToBPTBalance)
            error = Math.abs((input - target)/target)
            console.log(`error: ${error}`);
            assert.isTrue(error < errorBound);
        });            
    });

    describe('Test exitswapPoolAmountIn', () => {
        it('Should be able to exitswapPoolAmountIn with exit fee', async () => {

            // newExitFee = toWei('0.0');
            // await crpPool.setExitFee(newExitFee);
            await crpPool.setPayoutToken(AddressZero);

            // Get initial balances
            console.log('\nBalances before exit')
            bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
            bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
            bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
            console.log(`bPoolXYZBalance: ${fromWei(bPoolXYZBalance)}`)
            console.log(`bPoolWethBalance: ${fromWei(bPoolWethBalance)}`)
            console.log(`bPoolDaiBalance: ${fromWei(bPoolDaiBalance)}`)
        
            adminXYZBalance = await xyz.balanceOf.call(admin);
            adminWethBalance = await weth.balanceOf.call(admin);
            adminDaiBalance = await dai.balanceOf.call(admin);
            console.log(`adminXYZBalance: ${fromWei(adminXYZBalance)}`)
            console.log(`adminWethBalance: ${fromWei(adminWethBalance)}`)
            console.log(`adminDaiBalance: ${fromWei(adminDaiBalance)}`)
        
            // Call Exit
            console.log('\nExit call')
            // function exitswapPoolAmountIn(
            //     address tokenOut,
            //     uint poolAmountIn,
            //     uint minAmountOut
            // )
            result = await crpPool.exitswapPoolAmountIn(
                tokenAddresses[0],
                toWei('5'),         // must be less than the percentage of the pool owned by Tsoken Out
                toWei('0'),
            );
            
            tokenAmountOut = fromWei(result.logs[0]['args']['tokenAmountOut'])
            console.log(`Test Trade Amount Out: ${tokenAmountOut}`)   
            adminBPTBalance = await crpPool.balanceOf.call(admin);
            console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)     
            
            // Get post-exit balances
            console.log('\nBalances after exit')
            bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
            bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
            bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
            console.log(`bPoolXYZBalance: ${fromWei(bPoolXYZBalance)}`)
            console.log(`bPoolWethBalance: ${fromWei(bPoolWethBalance)}`)
            console.log(`bPoolDaiBalance: ${fromWei(bPoolDaiBalance)}`)
        
            adminXYZBalance = await xyz.balanceOf.call(admin);
            adminWethBalance = await weth.balanceOf.call(admin);
            adminDaiBalance = await dai.balanceOf.call(admin);
            console.log(`adminXYZBalance: ${fromWei(adminXYZBalance)}`)
            console.log(`adminWethBalance: ${fromWei(adminWethBalance)}`)
            console.log(`adminDaiBalance: ${fromWei(adminDaiBalance)}`)
        

            // trigger a _mintFee() call
            console.log('\nTrigger _mintFee()')
            await crpPool.mintFee({ from: user1 });

            adminBPTBalance = await crpPool.balanceOf.call(admin);
            feeToBPTBalance = await crpPool.balanceOf.call(feeTo);
            totalSupply = await crpPool.totalSupply()
            console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
            console.log(`feeToBPTBalance: ${fromWei(feeToBPTBalance)}`);
            console.log(`totalBPTBalance: ${fromWei(totalSupply)}`);
            console.log(`Frac pool owned by feeTo address: ${feeToBPTBalance/totalSupply}`) // should be 0.00005609288575673999

            fracPoolFees = await bPool.getFracPoolFees();
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

        
            // exitFeeTo balances
            exitFeeToXYZBalance  = await xyz.balanceOf.call(    exitFeeTo);
            exitFeeToWethBalance = await weth.balanceOf.call(   exitFeeTo);
            exitFeeToDaiBalance  = await dai.balanceOf.call(    exitFeeTo);
            exitFeeToBPTBalance  = await crpPool.balanceOf.call(exitFeeTo);
            console.log(`exitFeeToXYZBalance:  ${fromWei(exitFeeToXYZBalance)}`);
            console.log(`exitFeeToWethBalance: ${fromWei(exitFeeToWethBalance)}`);
            console.log(`exitFeeToDaiBalance:  ${fromWei(exitFeeToDaiBalance)}`);
            console.log(`exitFeeToBPTBalance:  ${fromWei(exitFeeToBPTBalance)}`);

            // Error checks 
            error = errorCheck(tokenAmountOut, 6.709278562306089197)
            assert.isTrue(error < errorBound);

            error = errorCheck(fromWei(feeToBPTBalance), 0.005270039504757134)
            assert.isTrue(error < errorBound);

            error = errorCheck(fromWei(exitFeeToBPTBalance), 0.05)
            assert.isTrue(error < errorBound);

            // error_bound = 0.00000000001
            // target = 0.2
            // input = fromWei(exitFeeToBPTBalance)
            // error = Math.abs((input - target)/target)
            // console.log(`error: ${error}`);
            // assert.isTrue(error < error_bound);
        });            
    });

    describe('Test exitswapExternAmountOut', () => {
        it('Should be able to exitswapExternAmountOut with exit fee', async () => {

            // newExitFee = toWei('0.0');
            // await crpPool.setExitFee(newExitFee);
            await crpPool.setPayoutToken(AddressZero);

            // Get initial balances
            console.log('\nBalances before exit')
            bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
            bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
            bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
            console.log(`bPoolXYZBalance: ${fromWei(bPoolXYZBalance)}`)
            console.log(`bPoolWethBalance: ${fromWei(bPoolWethBalance)}`)
            console.log(`bPoolDaiBalance: ${fromWei(bPoolDaiBalance)}`)
        
            adminXYZBalance = await xyz.balanceOf.call(admin);
            adminWethBalance = await weth.balanceOf.call(admin);
            adminDaiBalance = await dai.balanceOf.call(admin);
            console.log(`adminXYZBalance: ${fromWei(adminXYZBalance)}`)
            console.log(`adminWethBalance: ${fromWei(adminWethBalance)}`)
            console.log(`adminDaiBalance: ${fromWei(adminDaiBalance)}`)
        
            // Call Exit
            console.log('\nExit call')
            // Test transaction 1
            // function exitswapExternAmountOut(
            //     address tokenOut,
            //     uint tokenAmountOut,
            //     uint maxPoolAmountIn
            // )
            result = await crpPool.exitswapExternAmountOut(
                tokenAddresses[0],
                // No fee: toWei('6.7702841025'),
                toWei('6.709278562306089197'),
                MAX,
            );
            
            tokenAmountOut = fromWei(result.logs[0]['args']['tokenAmountOut'])
            console.log(`Test Trade Amount Out: ${tokenAmountOut}`)   
            adminBPTBalance = await crpPool.balanceOf.call(admin);
            console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
            fracPoolFees = await bPool.getFracPoolFees()
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)
            
            // Get post-exit balances
            console.log('\nBalances after exit')
            bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
            bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
            bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
            console.log(`bPoolXYZBalance: ${fromWei(bPoolXYZBalance)}`)
            console.log(`bPoolWethBalance: ${fromWei(bPoolWethBalance)}`)
            console.log(`bPoolDaiBalance: ${fromWei(bPoolDaiBalance)}`)
        
            adminXYZBalance = await xyz.balanceOf.call(admin);
            adminWethBalance = await weth.balanceOf.call(admin);
            adminDaiBalance = await dai.balanceOf.call(admin);
            console.log(`adminXYZBalance: ${fromWei(adminXYZBalance)}`)
            console.log(`adminWethBalance: ${fromWei(adminWethBalance)}`)
            console.log(`adminDaiBalance: ${fromWei(adminDaiBalance)}`)
        

            // trigger a _mintFee() call
            console.log('\nTrigger _mintFee()')
            await crpPool.mintFee({ from: user1 });

            adminBPTBalance = await crpPool.balanceOf.call(admin);
            feeToBPTBalance = await crpPool.balanceOf.call(feeTo);
            totalSupply = await crpPool.totalSupply()
            console.log(`adminBPTBalance: ${fromWei(adminBPTBalance)}`);
            console.log(`feeToBPTBalance: ${fromWei(feeToBPTBalance)}`);
            console.log(`Frac pool owned by feeTo address: ${feeToBPTBalance/totalSupply}`) // should be 0.00005609288575673999

            fracPoolFees = await bPool.getFracPoolFees();
            console.log(`Frac Pool Fees: ${fromWei(fracPoolFees)}`)

        
            // exitFeeTo balances
            exitFeeToXYZBalance  = await xyz.balanceOf.call(    exitFeeTo);
            exitFeeToWethBalance = await weth.balanceOf.call(   exitFeeTo);
            exitFeeToDaiBalance  = await dai.balanceOf.call(    exitFeeTo);
            exitFeeToBPTBalance  = await crpPool.balanceOf.call(exitFeeTo);
            console.log(`exitFeeToXYZBalance:  ${fromWei(exitFeeToXYZBalance)}`);
            console.log(`exitFeeToWethBalance: ${fromWei(exitFeeToWethBalance)}`);
            console.log(`exitFeeToDaiBalance:  ${fromWei(exitFeeToDaiBalance)}`);
            console.log(`exitFeeToBPTBalance:  ${fromWei(exitFeeToBPTBalance)}`);


            // Error checks 
            error = errorCheck(fromWei(adminBPTBalance), 95)
            assert.isTrue(error < errorBound);

            error = errorCheck(fromWei(feeToBPTBalance), 0.005270039504757134)
            assert.isTrue(error < errorBound);
            
            error = errorCheck(fromWei(exitFeeToBPTBalance), 0.05)
            assert.isTrue(error < errorBound);



            // error_bound = 0.00000000001
            // target = 0.2
            // input = fromWei(exitFeeToBPTBalance)
            // error = Math.abs((input - target)/target)
            // console.log(`error: ${error}`);
            // assert.isTrue(error < error_bound);
        });            
    });
});
