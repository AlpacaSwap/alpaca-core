const {expectRevert, time} = require("@openzeppelin/test-helpers");
const { assert } = require("chai");
const MasterRancher = artifacts.require("MasterRancher");
const truffleAssert = require("truffle-assertions");
const AlpacaToken = artifacts.require("AlpacaToken");
const MockERC20 = artifacts.require("MockERC20");
const UniswapV2Pair = artifacts.require("UniswapV2Pair");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const StakingRewards = artifacts.require('StakingRewards');

const {toWei, fromWei} = web3.utils;

contract("MasterRancherUNIStaking", ([alice, bob, carol, dev, minter]) => {

    const admin = alice;
    const user1 = bob;

    before(async () => {
        sb = await time.latestBlock();
        this.startBlock = sb.toNumber();

    });

    beforeEach(async () => {
        this.paca = await AlpacaToken.new({from: alice});
    });

    context("With ERC/LP token added to the field and staking in UNI pools", () => {
        beforeEach(async () => {
            this.lp = await MockERC20.new("LPToken", "LP", "10000000000", {
            from: minter,
            });
            await this.lp.transfer(alice, "1000", {from: minter});
            await this.lp.transfer(bob, "1000", {from: minter});
            await this.lp.transfer(carol, "1000", {from: minter});
            this.lp2 = await MockERC20.new("LPToken2", "LP2", "10000000000", {
            from: minter,
            });
            await this.lp2.transfer(alice, "1000", {from: minter});
            await this.lp2.transfer(bob, "1000", {from: minter});
            await this.lp2.transfer(carol, "1000", {from: minter});

            // this.weth = await MockERC20.new("WETH", "WETH", toWei("100000000"), { from: admin });
            this.uni = await MockERC20.new("UNI", "UNI", toWei("100000000"), { from: admin });

            this.usp1 = await StakingRewards.new(admin, this.uni.address, this.lp.address);
            this.usp2 = await StakingRewards.new(admin, this.uni.address, this.lp2.address);

            await this.uni.transfer(this.usp1.address, toWei('1000000'), { from: admin });
            await this.usp1.notifyRewardAmount(toWei('1000000'), { from: admin });

            await this.uni.transfer(this.usp2.address, toWei('2000000'), { from: admin });
            await this.usp2.notifyRewardAmount(toWei('2000000'), { from: admin });
        });

        it("should allow emergency withdraw", async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.ranch = await MasterRancher.new(
                this.paca.address,
                dev,
                "100",
                String(this.startBlock + 100),
                String(this.startBlock + 1000),
                // "100",
                // "1000",
                false,
                {from: alice}
            );
            await this.ranch.add("100", this.lp.address, true, this.usp1.address);
            await this.lp.approve(this.ranch.address, "1000", {from: bob});
            await this.ranch.deposit(0, "100", {from: bob});
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), "900");
            // only dev should be able to call emergencyUnstake()
            await expectRevert(this.ranch.emergencyUnstake({from: alice}), "dev: wut?");
            await this.ranch.emergencyUnstake({from: dev});
            await this.ranch.emergencyWithdraw(0, {from: bob});
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), "1000");
        });

        it('should give out PACAs only after farming time', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            // this.ranch = await MasterRancher.new(this.paca.address, dev, '100', '100', '1000', { from: alice });
            this.ranch = await MasterRancher.new(
                this.paca.address, 
                dev, 
                '110', 
                String(this.startBlock + 100),
                String(this.startBlock + 1000),
                // '100', 
                // '1000', 
                false,
                { from: alice }
            );
            await this.paca.transferOwnership(this.ranch.address, { from: alice });
            await this.ranch.add('100', this.lp.address, true, this.usp1.address);
            await this.lp.approve(this.ranch.address, '1000', { from: bob });
            await this.ranch.deposit(0, '100', { from: bob });
            // await time.advanceBlockTo(this.startBlock + '90');
            await time.advanceBlockTo(this.startBlock + 90);
            await this.ranch.deposit(0, '0', { from: bob }); // block 91
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo(this.startBlock + 94);
            await this.ranch.deposit(0, '0', { from: bob }); // block 95
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo(this.startBlock + 99);
            await this.ranch.deposit(0, '0', { from: bob }); // block 100
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo(this.startBlock + 100);
            await this.ranch.deposit(0, '0', { from: bob }); // block 101
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), '1000');
            // assert.equal((await this.paca.balanceOf(bob)).valueOf(), '950');
            await time.advanceBlockTo(this.startBlock + 104);
            await this.ranch.deposit(0, '0', { from: bob }); // block 105
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), '5000');
            assert.equal((await this.paca.balanceOf(dev)).valueOf(), '500');
            assert.equal((await this.paca.totalSupply()).valueOf(), '5500');
        });

        it("should not distribute PACAs if no one deposit", async () => {
            // 100 per block farming rate starting at block 200 with bonus until block 1000
            this.ranch = await MasterRancher.new(
                this.paca.address,
                dev,
                "110",
                String(this.startBlock + 200),
                String(this.startBlock + 1000),
                // "200",
                // "1000",
                false,
                {from: alice}
            );
            
            await this.paca.transferOwnership(this.ranch.address, {from: alice});
            await this.ranch.add("100", this.lp.address, true, this.usp1.address);
            await this.lp.approve(this.ranch.address, "1000", {from: bob});
            await time.advanceBlockTo(this.startBlock + 199);
            assert.equal((await this.paca.totalSupply()).valueOf(), "0");
            await time.advanceBlockTo(this.startBlock + 204);
            assert.equal((await this.paca.totalSupply()).valueOf(), "0");
            await time.advanceBlockTo(this.startBlock + 209);
            await this.ranch.deposit(0, "10", {from: bob}); // block 210
            assert.equal((await this.paca.totalSupply()).valueOf(), "0");
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), "0");
            assert.equal((await this.paca.balanceOf(dev)).valueOf(), "0");
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), "990");
            await time.advanceBlockTo(this.startBlock + 219);
            await this.ranch.withdraw(0, "10", {from: bob}); // block 220
            assert.equal((await this.paca.totalSupply()).valueOf(), "11000");
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), "10000");
            assert.equal((await this.paca.balanceOf(dev)).valueOf(), "1000");
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), "1000");
        });

        it("should distribute PACAs properly for each staker", async () => {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.ranch = await MasterRancher.new(
                this.paca.address,
                dev,
                "110",
                String(this.startBlock + 300),
                String(this.startBlock + 1000),
                // "300",
                // "1000",
                false,
                {from: alice}
            );
            await this.paca.transferOwnership(this.ranch.address, {from: alice});
            await this.ranch.add("100", this.lp.address, true, this.usp1.address);
            await this.lp.approve(this.ranch.address, "1000", {from: alice});
            await this.lp.approve(this.ranch.address, "1000", {from: bob});
            await this.lp.approve(this.ranch.address, "1000", {from: carol});
            // Alice deposits 10 LPs at block 310
            await time.advanceBlockTo(this.startBlock + 309);
            await this.ranch.deposit(0, "10", {from: alice});
            // Bob deposits 20 LPs at block 314
            await time.advanceBlockTo(this.startBlock + 313);
            await this.ranch.deposit(0, "20", {from: bob});
            // Carol deposits 30 LPs at block 318
            await time.advanceBlockTo(this.startBlock + 317);
            await this.ranch.deposit(0, "30", {from: carol});
            // Alice deposits 10 more LPs at block 320. At this point:
            //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
            //   Masterranch should have the remaining: 10000 - 5666 = 4334
            await time.advanceBlockTo(this.startBlock + 319);
            await this.ranch.deposit(0, "10", {from: alice});
            assert.equal((await this.paca.totalSupply()).valueOf(), "11000");
            assert.equal((await this.paca.balanceOf(alice)).valueOf(), "5666");
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), "0");
            assert.equal((await this.paca.balanceOf(carol)).valueOf(), "0");
            assert.equal(
                (await this.paca.balanceOf(this.ranch.address)).valueOf(),
                "4334"
            );
            assert.equal((await this.paca.balanceOf(dev)).valueOf(), "1000");
            // Bob withdraws 5 LPs at block 330. At this point:
            //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
            await time.advanceBlockTo(this.startBlock + 329);
            await this.ranch.withdraw(0, "5", {from: bob});
            assert.equal((await this.paca.totalSupply()).valueOf(), "22000");
            assert.equal((await this.paca.balanceOf(alice)).valueOf(), "5666");
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), "6190");
            assert.equal((await this.paca.balanceOf(carol)).valueOf(), "0");
            assert.equal(
                (await this.paca.balanceOf(this.ranch.address)).valueOf(),
                "8144"
            );
            assert.equal((await this.paca.balanceOf(dev)).valueOf(), "2000");
            // Alice withdraws 20 LPs at block 340.
            // Bob withdraws 15 LPs at block 350.
            // Carol withdraws 30 LPs at block 360.
            await time.advanceBlockTo(this.startBlock + 339);
            await this.ranch.withdraw(0, "20", {from: alice});
            await time.advanceBlockTo(this.startBlock + 349);
            await this.ranch.withdraw(0, "15", {from: bob});
            await time.advanceBlockTo(this.startBlock + 359);
            await this.ranch.withdraw(0, "30", {from: carol});
            assert.equal((await this.paca.totalSupply()).valueOf(), "55000");
            assert.equal((await this.paca.balanceOf(dev)).valueOf(), "5000");
            // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
            assert.equal((await this.paca.balanceOf(alice)).valueOf(), "11600");
            // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
            assert.equal((await this.paca.balanceOf(bob)).valueOf(), "11831");
            // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
            assert.equal((await this.paca.balanceOf(carol)).valueOf(), "26568");
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), "1000");
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), "1000");
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), "1000");
        });

        it("should give proper PACAs allocation to each pool", async () => {
            // 100 per block farming rate starting at block 400 with bonus until block 1000
            this.ranch = await MasterRancher.new(
                this.paca.address,
                dev,
                "110",
                String(this.startBlock + 400),
                String(this.startBlock + 1000),
                // "400",
                // "1000",
                false,
                {from: alice}
            );
            await this.paca.transferOwnership(this.ranch.address, {from: alice});
            await this.lp.approve(this.ranch.address, "1000", {from: alice});
            await this.lp2.approve(this.ranch.address, "1000", {from: bob});
            // Add first LP to the pool with allocation 1
            await this.ranch.add("10", this.lp.address, true, this.usp1.address);
            // Alice deposits 10 LPs at block 410
            await time.advanceBlockTo(this.startBlock + 409);
            await this.ranch.deposit(0, "10", {from: alice});
            // Add LP2 to the pool with allocation 2 at block 420
            await time.advanceBlockTo(this.startBlock + 419);
            await this.ranch.add("20", this.lp2.address, true, this.usp2.address);
            // Alice should have 10*1000 pending reward
            assert.equal((await this.ranch.pendingPaca(0, alice)).valueOf(), "10000");
            // Bob deposits 10 LP2s at block 425
            await time.advanceBlockTo(this.startBlock + 424);
            await this.ranch.deposit(1, "5", {from: bob});
            // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
            assert.equal((await this.ranch.pendingPaca(0, alice)).valueOf(), "11667");
            await time.advanceBlockTo(this.startBlock + 430);
            // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
            assert.equal((await this.ranch.pendingPaca(0, alice)).valueOf(), "13333");
            assert.equal((await this.ranch.pendingPaca(1, bob)).valueOf(), "3333");
        });

        it("should stop giving bonus PACAs after the bonus period ends", async () => {
            // 100 per block farming rate starting at block 500 with bonus until block 600
            this.ranch = await MasterRancher.new(
                this.paca.address,
                dev,
                "110",
                String(this.startBlock + 500),
                String(this.startBlock + 600),
                // "500",
                // "600",
                false,
                {from: alice}
            );
            await this.paca.transferOwnership(this.ranch.address, {from: alice});
            await this.lp.approve(this.ranch.address, "1000", {from: alice});
            await this.ranch.add("1", this.lp.address, true, this.usp1.address);
            // Alice deposits 10 LPs at block 590
            await time.advanceBlockTo(this.startBlock + 589);
            await this.ranch.deposit(0, "10", {from: alice});
            // At block 605, she should have 1000*10 + 100*5 = 10500 pending.
            await time.advanceBlockTo(this.startBlock + 605);
            assert.equal((await this.ranch.pendingPaca(0, alice)).valueOf(), "10500");
            // At block 606, Alice withdraws all pending rewards and should get 10600.
            await this.ranch.deposit(0, "0", {from: alice});
            assert.equal((await this.ranch.pendingPaca(0, alice)).valueOf(), "0");
            assert.equal((await this.paca.balanceOf(alice)).valueOf(), "10600");
        });

        it("Ranch should stake, unstake, and accumulate UNI rewards", async () => {
            // 100 per block farming rate starting at block 400 with bonus until block 1000
            this.ranch = await MasterRancher.new(
                this.paca.address,
                dev,
                "110",
                String(this.startBlock + 500),
                String(this.startBlock + 1000),
                // "400",
                // "1000",
                false,
                {from: alice}
            );
            await this.paca.transferOwnership(this.ranch.address, {from: alice});
            await this.lp.approve(this.ranch.address, "1000", {from: alice});
            await this.lp2.approve(this.ranch.address, "1000", {from: bob});
            // Add first LP to the pool with allocation 1
            
            usp1RR = await this.usp1.rewardRate();
            usp2RR = await this.usp2.rewardRate();

            block1 = await time.latestBlock();
            time1 = await time.latest();

            assert.equal((await this.uni.balanceOf(this.ranch.address)).valueOf(), "0");

            // lp1Bal1 = await this.lp.balanceOf(alice)
            assert.equal((await this.lp.balanceOf(this.usp1.address)).valueOf(), "0");
            assert.equal((await this.lp2.balanceOf(this.usp2.address)).valueOf(), "0");

            // Add LP1 to Ranch
            await this.ranch.add("10", this.lp.address, true, this.usp1.address);
            block2 = await time.latestBlock();
            time2 = await time.latest();
            // Alice deposits LP1
            await this.ranch.deposit(0, "10", {from: alice});
            block3 = await time.latestBlock();
            time3 = await time.latest();
            assert.equal((await this.lp.balanceOf(this.usp1.address)).valueOf(), "10");
            // Add LP2 to Ranch
            await this.ranch.add("20", this.lp2.address, true, this.usp2.address);
            block4 = await time.latestBlock();
            time4 = await time.latest();
            // Bob deposits LP2
            await this.ranch.deposit(1, "5", {from: bob});
            block5 = await time.latestBlock();
            time5 = await time.latest();
            assert.equal((await this.lp2.balanceOf(this.usp2.address)).valueOf(), "5");
            // Increase time
            await time.increase(10);
            block6 = await time.latestBlock();
            time6 = await time.latest();
            // Unstake and collect rewards
            await this.ranch.emergencyUnstake({from: dev});
            block7 = await time.latestBlock();
            time7 = await time.latest();
            assert.equal((await this.lp.balanceOf(this.ranch.address)).valueOf(), "10");
            assert.equal((await this.lp2.balanceOf(this.ranch.address)).valueOf(), "5");

            ranchUNI = await this.uni.balanceOf(this.ranch.address);
            ranchUNI = fromWei(ranchUNI);
            // console.log(`ranchUNI: ${fromWei(ranchUNI)}`)
            ranchUNIPool1 = fromWei(usp1RR) * (time7.toNumber() - time3.toNumber());
            ranchUNIPool2 = fromWei(usp2RR) * (time7.toNumber() - time5.toNumber());
            ranchUNIEst = ranchUNIPool1 + ranchUNIPool2;
            
            assert.equal(Math.round(ranchUNI * 10**10) / 10**10, Math.round(ranchUNIEst * 10**10) / 10**10);
        });
    });
});
