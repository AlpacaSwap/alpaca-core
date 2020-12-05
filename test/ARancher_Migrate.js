const { expectRevert, time } = require("@openzeppelin/test-helpers");
const BFactory = artifacts.require("BFactory");
const ConfigurableRightsPool = artifacts.require("ConfigurableRightsPool");
const CRPFactory = artifacts.require("CRPFactory");
const MasterRancher = artifacts.require("MasterRancher");
const truffleAssert = require("truffle-assertions");
const AlpacaToken = artifacts.require("AlpacaToken");
const MockERC20 = artifacts.require("MockERC20");
const UniswapV2Pair = artifacts.require("UniswapV2Pair");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const Migrator = artifacts.require("Migrator");
const BPool = artifacts.require("BPool");
const ERC20 = artifacts.require("ERC20");
const StakingRewards = artifacts.require('StakingRewards');
// console.log = function() {}
const { AddressZero } = require('ethers/constants');
const { assert } = require("chai");

contract("RancherMigrate", ([alice, bob, carol, dev, minter]) => {
  const { toWei, fromWei } = web3.utils;
  let pacaRewardsPerBlock = toWei('40');



  describe("With Uniswap LP tokens added", () => {
    before(async () => {
      this.bFactory = await BFactory.new();
      this.crpFactory = await CRPFactory.new();
      this.factory1 = await UniswapV2Factory.new(alice, { from: alice });

      this.weth = await MockERC20.new("WETH", "WETH", toWei('10000'), { from: minter });
      console.log(`weth address: ${this.weth.address}`);
      this.token1 = await MockERC20.new("TOKEN1", "TOKEN1", toWei('10000'), { from: minter });
      console.log(`token1 address: ${this.token1.address}`);
      this.token2 = await MockERC20.new("TOKEN2", "TOKEN2", toWei('10000'), { from: minter });
      console.log(`token2 address: ${this.token2.address}`);
      this.token3 = await MockERC20.new("TOKEN3", "TOKEN3", toWei('10000'), { from: minter });
      console.log(`token3 address: ${this.token3.address}`);
      this.paca = await AlpacaToken.new({ from: minter });
      await this.paca.mint(minter, toWei('100000'), {from: minter });
      console.log(`alpaca address: ${this.paca.address}`);
      this.uni = await MockERC20.new("UNI", "UNI", toWei('100000000'), { from: minter });
      console.log(`token1 address: ${this.uni.address}`);

      this.lp1 = await UniswapV2Pair.at(
        (await this.factory1.createPair(this.weth.address, this.token1.address)).logs[0].args.pair
      );
      this.lp2 = await UniswapV2Pair.at(
        (await this.factory1.createPair(this.weth.address, this.token2.address)).logs[0].args.pair
      );
      this.lp3 = await UniswapV2Pair.at(
        (await this.factory1.createPair(this.weth.address, this.token3.address)).logs[0].args.pair
      );
      this.lp4 = await UniswapV2Pair.at(
        (await this.factory1.createPair(this.weth.address, this.paca.address)).logs[0].args.pair
      );
      this.lpUNI = await UniswapV2Pair.at(
        (await this.factory1.createPair(this.weth.address, this.uni.address)).logs[0].args.pair
      );

      // set up UNI staking pools
      // No reward pool for PACA
      this.usp1 = await StakingRewards.new(minter, this.uni.address, this.lp1.address);
      this.usp2 = await StakingRewards.new(minter, this.uni.address, this.lp2.address);
      this.usp3 = await StakingRewards.new(minter, this.uni.address, this.lp3.address);
      await this.uni.transfer(this.usp1.address, toWei('1000000'), { from: minter });
      await this.uni.transfer(this.usp2.address, toWei('1000000'), { from: minter });
      await this.uni.transfer(this.usp3.address, toWei('1000000'), { from: minter });
      await this.usp1.notifyRewardAmount(toWei('1000000'), { from: minter });
      await this.usp2.notifyRewardAmount(toWei('1000000'), { from: minter });
      await this.usp3.notifyRewardAmount(toWei('1000000'), { from: minter });
      
      //loading pairs with tokens.
      await this.token1.transfer(this.lp1.address, toWei('1000'), { from: minter, });
      await this.weth.transfer(this.lp1.address, toWei('1000'), { from: minter, });
      await this.lp1.mint(minter);
      const minted1 = await this.lp1.balanceOf(minter);
      console.log(`minted1 lp: ${minted1}`);
      const totalSupply1 = await this.lp1.totalSupply().valueOf();
      console.log(`minted1 totalSupply: ${totalSupply1}`);

      await this.token2.transfer(this.lp2.address, toWei('1000'), { from: minter });
      await this.weth.transfer(this.lp2.address, toWei('1000'), { from: minter });
      await this.lp2.mint(minter);
      const minted2 = await this.lp2.balanceOf(minter);
      console.log(`minted2 lp: ${minted2}`);
      const totalSupply2 = await this.lp2.totalSupply().valueOf();
      console.log(`minted2 totalSupply: ${totalSupply2}`);

      await this.token3.transfer(this.lp3.address, toWei('4000'), { from: minter });
      await this.weth.transfer(this.lp3.address, toWei('1000'), { from: minter });
      await this.lp3.mint(minter);
      const minted3 = await this.lp3.balanceOf(minter);
      console.log(`minted3 lp: ${minted3}`);
      const totalSupply3 = await this.lp3.totalSupply().valueOf();
      console.log(`minted3 totalSupply: ${totalSupply3}`);

      await this.paca.transfer(this.lp4.address, toWei('10000'), { from: minter});
      await this.weth.transfer(this.lp4.address, toWei('100'), { from: minter });
      await this.lp4.mint(minter);
      const minted4 = await this.lp4.balanceOf(minter);
      console.log(`minted4 lp: ${minted4}`);
      const totalSupply4 = await this.lp4.totalSupply().valueOf();
      console.log(`minted4 totalSupply: ${totalSupply4}`);

      await this.uni.transfer(this.lpUNI.address, toWei('1000'), { from: minter});
      await this.weth.transfer(this.lpUNI.address, toWei('100'), { from: minter });
      await this.lpUNI.mint(minter);
      const mintedUNI = await this.lpUNI.balanceOf(minter);
      console.log(`mintedUNI lp: ${mintedUNI}`);
      const totalSupplyUNILP = await this.lpUNI.totalSupply().valueOf();
      console.log(`mintedUNILP totalSupply: ${totalSupplyUNILP}`);

    });


    it("Reward distribution per block tests", async () => {
      let block = await web3.eth.getBlock("latest");
      let start_block_number = block.number + 100;
      console.log("rancher start reward block: ", start_block_number);
      this.ranch = await MasterRancher.new(
        this.paca.address,
        dev,
        pacaRewardsPerBlock,
        start_block_number,
        start_block_number + 10000,
        true,
        { from: alice }
      );
      this.migrator = await Migrator.new(
        this.ranch.address,
        this.factory1.address,
        this.bFactory.address,
        this.crpFactory.address,
        this.weth.address,
        this.paca.address,
        "0"
      );
      console.log("migrator address:", this.migrator.address);

      //approve LP tokens for
      await this.paca.transferOwnership(this.ranch.address, { from: minter });
      let minted1 = await this.lp1.balanceOf(minter);
      console.log("lp1 minted: ", fromWei(minted1));
      await this.lp1.approve(this.ranch.address, minted1, { from: minter });
      let minted2 = await this.lp2.balanceOf(minter);
      console.log("lp2 minted: ", fromWei(minted2));
      await this.lp2.approve(this.ranch.address, minted2, { from: minter });
      let minted3 = await this.lp3.balanceOf(minter);
      console.log("lp3 minted: ", fromWei(minted3));
      await this.lp3.approve(this.ranch.address, minted3, { from: minter });
      let minted4 = await this.lp4.balanceOf(minter);
      console.log("lp4 minted: ", fromWei(minted4));
      await this.lp4.approve(this.ranch.address, minted4, { from: minter });

      // add LPs to the pool
      // await this.ranch.add("100", this.lp1.address, true, this.usp1.address, { from: alice });
      await this.ranch.add("100", this.lp1.address, true, this.usp1.address);
      await this.ranch.add("100", this.lp2.address, true, this.usp2.address);
      await this.ranch.add("100", this.lp3.address, true, this.usp3.address);
      await this.ranch.add("100", this.lp4.address, true, AddressZero);

      block = await web3.eth.getBlock("latest");
      console.log("adding deposit, current block number: ", block.number);
      await this.ranch.deposit(0, minted1, { from: minter });
      await this.ranch.deposit(1, minted2, { from: minter });
      await this.ranch.deposit(2, minted3, { from: minter });
      await this.ranch.deposit(3, minted4, { from: minter });
      await time.advanceBlockTo(start_block_number + 1);

      block = await web3.eth.getBlock("latest");
      console.log("|||current block: ", block.number);
      for(i = 0; i<4; i++)
      {
        //PACA reward should be (pacaRewardsPerBlock * 10 / 4) - pacaRewardsPerBlock * 10 / 11
        // in this case given that 4 pools have equal weight, the reward should be around 100-9 = 91 PACA a block
        rewards = fromWei((await this.ranch.pendingPaca(0, minter)));
        console.log("pid ", i, " rewards: ", rewards );
        assert.isAbove(parseFloat(rewards), 90);
        assert.isBelow(parseFloat(rewards), 91);
      }

      await time.advanceBlockTo(start_block_number + 9);
      console.log("advanced to block", start_block_number + 9);
      console.log("start mass update");
      await this.ranch.massUpdatePools();
      for(i = 0; i<4; i++)
      {
        //PACA reward should be (pacaRewardsPerBlock * 10 / 4) - pacaRewardsPerBlock * 10 / 11
        // in this case given that 4 pools have equal weight, the reward should be around 1000-90= 910 PACA
        rewards = fromWei((await this.ranch.pendingPaca(0, minter)));
        console.log("pid ", i, " rewards: ", rewards );
        assert.isAbove(parseFloat(rewards), 900);
        assert.isBelow(parseFloat(rewards), 910);
      }
    });
    it("Does not allow deposit during ranch establishment", async () => {

      await this.ranch.setMigrator(this.migrator.address);
      await this.ranch.pauseOperation();
      await expectRevert(this.ranch.deposit(0, "10", { from: minter }), "establishing ranch, relax");
    });

    it("Migration tests", async () => {
      // Give to time to get UNI
      await time.increase(100);

      await this.ranch.migrate(0);
      await this.ranch.migrate(1);
      await this.ranch.migrate(2);
      //we are migrating PACA here. check for total supply before and after
      prePacaTotalSupply = await this.paca.totalSupply();
      console.log("PACA Total before migration: ", fromWei(prePacaTotalSupply.toString()));
      await this.ranch.migrate(3).then(function (result) {
        console.log("PACA migration hash", result.tx);
      });
      postPacaTotalSupply = await this.paca.totalSupply();
      console.log("PACA Total after migration: ", fromWei(postPacaTotalSupply.toString()));
      console.log("migrator1: ", await this.ranch.migrator());
      console.log("total tokens: ", (await this.migrator.totalTokens()).toNumber());
      // PACA grant must be before establishTokenSetting
      for (i = 0; i <= 4; i++) {
        poolcontent = (await this.migrator.omniPool(await this.migrator.tokenHolder(i)));
        console.log("omniPool", i, "balance: ", fromWei(poolcontent.balance));
        console.log("omniPool", i, "wethValue: ", fromWei(poolcontent.wethValue));
        console.log("omniPool", i, "shares: ", fromWei(poolcontent.shares));
      }
      console.log("total weth:", fromWei(await this.migrator.totalWeth()));
      console.log("total weth shares:", fromWei((await this.migrator.totalWethforShares())));

      //we have completed migration based the tokens we deposited they should have:
      //token.wethValue = WETH amount previously deposited
      //token.balance = previous balance deposited into uniswap -1000 wei (don't ask me why)
      //paca balance = previous deposited amount + inflation - 100 wei
      //paca wethvalue = WETH amount previously deposited and then proportionally increased
      //WETH amount = WETH value = token0 + token1 + token2 + PACA's weth value before inflation

      //WETH
      poolcontent = (await this.migrator.omniPool(await this.migrator.tokenHolder(0)));
      //1000*3 + 100 (PACA)
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.balance))), 3100);
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.wethValue))), 3100);

      //token1
      poolcontent = (await this.migrator.omniPool(await this.migrator.tokenHolder(1)));
      //1000
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.balance))), 1000);
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.wethValue))), 1000);

      //token2
      poolcontent = (await this.migrator.omniPool(await this.migrator.tokenHolder(2)));
      //1000
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.balance))), 1000);
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.wethValue))), 1000);

      //token3
      poolcontent = (await this.migrator.omniPool(await this.migrator.tokenHolder(3)));
      //3000
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.balance))), 4000);
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.wethValue))), 1000);


      //PACA
      poolcontent = (await this.migrator.omniPool(await this.migrator.tokenHolder(4)));
      //
      inflatedAmount = parseInt(fromWei(postPacaTotalSupply.sub(prePacaTotalSupply)))
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.balance))), 10000 + inflatedAmount);
      assert.equal(Math.round(parseFloat(fromWei(poolcontent.wethValue))), 620);

    });

    it("Migrator properly liquidates UNI", async () => {
      // Liquidate UNI for WETH
      ranchUNI = fromWei(await this.uni.balanceOf(this.ranch.address));
      migratorWETH0 = fromWei(await this.weth.balanceOf(this.migrator.address));
      migratorTotalWeth0 = fromWei(await this.migrator.totalWeth());
      migratorTotalForShares0 = fromWei(await this.migrator.totalWethforShares());
      uniLPReserves = await this.lpUNI.getReserves();
      token0 = await this.lpUNI.token0();
      token1 = await this.lpUNI.token1();

      if (token0 == this.uni.address) {
        r0 = parseFloat(fromWei(uniLPReserves[0]));
        r1 = parseFloat(fromWei(uniLPReserves[1]));
      } else {
        r0 = parseFloat(fromWei(uniLPReserves[1]));
        r1 = parseFloat(fromWei(uniLPReserves[0])); 
      }
      dr0 = parseFloat(ranchUNI);
      dr1 = r0*r1 / (r0 + dr0 * (1 - 0.003)) - r1;
      dB = -dr1;

      // console.log("A", r0);
      // console.log("B", r1);
      // console.log("dA", dr0);
      // console.log("dB", dr1);
      // // console.log("Num", A * B);
      // // console.log("Denom", A + dA * (1 - 0.003));
      // console.log("token0", token0);
      // console.log("token1", token1);
      // console.log("uni   ", this.uni.address);

      console.log("\nBefore UNI liquidation:");
      console.log("   Ranch UNI balance: ", fromWei(await this.uni.balanceOf(this.ranch.address)));
      console.log("   Ranch WETH balance:", fromWei(await this.weth.balanceOf(this.ranch.address)));
      console.log("   Mgrtr UNI balance: ", fromWei(await this.uni.balanceOf(this.migrator.address)));
      console.log("   Mgrtr WETH balance:", fromWei(await this.weth.balanceOf(this.migrator.address)));

      console.log("\nLiquidating...");
      this.ranch.setUNI(this.uni.address, { from: alice });
      this.ranch.liquidateUNI({ from: alice });

      console.log("\nAfter UNI liquidation:")
      console.log("   Ranch UNI balance: ", fromWei(await this.uni.balanceOf(this.ranch.address)));
      console.log("   Ranch WETH balance:", fromWei(await this.weth.balanceOf(this.ranch.address)));
      console.log("   Mgrtr UNI balance: ", fromWei(await this.uni.balanceOf(this.migrator.address)));
      console.log("   Mgrtr WETH balance:", fromWei(await this.weth.balanceOf(this.migrator.address)));

      console.log("\nMigrator counts:");
      console.log("   total weth:", fromWei(await this.migrator.totalWeth()));
      console.log("   total weth shares:", fromWei((await this.migrator.totalWethforShares())));

      migratorWETH1 = fromWei(await this.weth.balanceOf(this.migrator.address));
      migratorWETH1Diff = migratorWETH1 - migratorWETH0;
      migratorTotalWeth1 = fromWei(await this.migrator.totalWeth());
      migratorTotalWethDiff = migratorTotalWeth1 - migratorTotalWeth0;
      migratorTotalForShares1 = fromWei(await this.migrator.totalWethforShares());

      console.log("\nVerify UNI sale amount:");
      console.log("   Manual:", dB);
      console.log("   Actual:", migratorWETH1Diff);

      function round(x, ndigits) {
        return Math.round(x * 10**ndigits) / 10**ndigits;
      }

      this.wethFromUni = migratorWETH1Diff;
      
      // Change in tracked total WETH matches actual change
      assert.equal(round(migratorWETH1Diff, 10), round(migratorTotalWethDiff, 10));
      // Tracked total WETH For Shares should not change
      assert.equal(migratorTotalForShares1, migratorTotalForShares0);
      // Amount of WETH out should match true amount from Uniswap sale
      assert.equal(round(dB, 10), round(migratorWETH1Diff, 10));
    });

    it("Ranch Setting tests", async () => {

      await this.ranch.establishTokenSetting();
      await this.ranch.establishRanch();
      block = await web3.eth.getBlock("latest");
      console.log("established ranch, finalizing at block", block.number);
      // await this.ranch.finalizeRanch(this.ranch.address, toWei("0.75"), dev, toWei("0.005"), this.weth.address);
      await this.ranch.finalizeRanch(this.ranch.address, toWei("0.75"), dev, toWei("0.005"), this.paca.address);
      console.log("ranch established");
      for (i = 0; i < 5; i++) {
        shares = fromWei((await this.ranch.poolInfo(i)).allocPoint.toString());
        console.log("OmniPool pid ", i, " shares: ", shares);
      }

      Omni = await ConfigurableRightsPool.at(await this.migrator.pacaOmniPool());
      Bpool = await BPool.at(await Omni.bPool());
      console.log("weth balance: ", fromWei(await Bpool.getBalance(this.weth.address)));
      console.log("token1 balance: ", fromWei(await Bpool.getBalance(this.token1.address)));
      console.log("token2 balance: ", fromWei(await Bpool.getBalance(this.token2.address)));
      console.log("token3 balance: ", fromWei(await Bpool.getBalance(this.token3.address)));
      console.log("paca balance: ", fromWei(await Bpool.getBalance(this.paca.address)));

      console.log("weth denorm: ", fromWei(await Bpool.getDenormalizedWeight(this.weth.address)));
      console.log("token1 denorm: ", fromWei(await Bpool.getDenormalizedWeight(this.token1.address)));
      console.log("token2 denorm: ", fromWei(await Bpool.getDenormalizedWeight(this.token2.address)));
      console.log("token3 denorm: ", fromWei(await Bpool.getDenormalizedWeight(this.token3.address)));
      console.log("paca denorm: ", fromWei(await Bpool.getDenormalizedWeight(this.paca.address)));

      //verify the balances are correct - should be the original deposit amount except for PACA (INFLATED!)
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getBalance(this.weth.address)))), Math.round(parseFloat(3100 + this.wethFromUni)));
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getBalance(this.token1.address)))), 1000);
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getBalance(this.token2.address)))), 1000);
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getBalance(this.token3.address)))), 4000);
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getBalance(this.paca.address)))), 62000);

      //verify the weights are correct total should be 1000
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getDenormalizedWeight(this.weth.address)))), 462);
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getDenormalizedWeight(this.token1.address)))), 149);
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getDenormalizedWeight(this.token2.address)))), 149);
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getDenormalizedWeight(this.token3.address)))), 149);
      assert.equal(Math.round(parseFloat(fromWei(await Bpool.getDenormalizedWeight(this.paca.address)))), 92);

      //verify the shares are correct, this should just be their old deposit amount * 2
      assert.equal(Math.round(parseFloat(fromWei((await this.ranch.poolInfo(0)).allocPoint.toString()))), 2000);
      assert.equal(Math.round(parseFloat(fromWei((await this.ranch.poolInfo(1)).allocPoint.toString()))), 2000);
      assert.equal(Math.round(parseFloat(fromWei((await this.ranch.poolInfo(2)).allocPoint.toString()))), 2000);
      assert.equal(Math.round(parseFloat(fromWei((await this.ranch.poolInfo(3)).allocPoint.toString()))), 200);

    });
    it("Reward distribution post migration tests", async () => {
      block = await web3.eth.getBlock("latest");
      console.log("|||current block: ", block.number);
      this.sharesToTransfer = preShares0 = fromWei((await this.ranch.poolInfo(0)).allocPoint.toString());
      preReward0 = fromWei((await this.ranch.pendingPaca(0, minter)).toString());
      preSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      preRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      await time.advanceBlock();
      postShares0 = fromWei((await this.ranch.poolInfo(0)).allocPoint.toString());
      postReward0 = fromWei((await this.ranch.pendingPaca(0, minter)).toString());
      postSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      postRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      devPctInv = await this.ranch.devPctInv();
      poolRewardsPerBlock = pacaRewardsPerBlock - pacaRewardsPerBlock / devPctInv;
      console.log("poolRewardsPerBlock: ", fromWei(poolRewardsPerBlock.toString()));

      postRewarPacaDiff = parseFloat(postRewardPaca) - parseFloat(preRewardPaca);
      postRewarDiff = parseFloat(postReward0) - parseFloat(preReward0);
      calculatedRewards = (postRewarDiff) * 3
        + postRewarPacaDiff;

      assert.equal(Math.round(calculatedRewards), Math.round(parseFloat(fromWei(poolRewardsPerBlock.toString())) * 10));
      //paca is 10% of the weight
      assert.equal(Math.round(postRewarPacaDiff * 10), Math.round(postRewarDiff));
    });

    it("Does not allow withdraw (only redeem) for legacy pool", async () => {
      await expectRevert(this.ranch.withdraw(1, 100, { from: minter }), "use redemption for legacy withdrawal");
    });

    it("Does not allow deposit into legacy pool", async () => {
      await expectRevert(this.ranch.deposit(1, 100, { from: minter }), "Address: call to non-contract");
    });

    it("Redeem from legacy pool and check rewards afterwards", async () => {

      await this.ranch.redeem(0, { from: minter });
      await time.advanceBlock();
      block = await web3.eth.getBlock("latest");
      console.log("|||current block: ", block.number);
      preShares0 = fromWei((await this.ranch.poolInfo(1)).allocPoint.toString());
      preReward0 = fromWei((await this.ranch.pendingPaca(1, minter)).toString());
      preSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      preRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      await time.advanceBlock();
      postShares0 = fromWei((await this.ranch.poolInfo(1)).allocPoint.toString());
      postReward0 = fromWei((await this.ranch.pendingPaca(1, minter)).toString());
      postSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      postRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      devPctInv = await this.ranch.devPctInv();
      poolRewardsPerBlock = pacaRewardsPerBlock - pacaRewardsPerBlock / devPctInv;
      console.log("poolRewardsPerBlock: ", fromWei(poolRewardsPerBlock.toString()));
      //after redemption, it should be 2000 2000 200 shares for each pool as pool(0) is drained
      postRewarPacaDiff = parseFloat(postRewardPaca) - parseFloat(preRewardPaca);
      postRewarDiff = parseFloat(postReward0) - parseFloat(preReward0);
      calculatedRewards = (postRewarDiff) * 2
        + postRewarPacaDiff;

      console.log("totalAllocPoint: ", fromWei((await this.ranch.totalAllocPoint()).toString()));
      assert.equal(Math.round(calculatedRewards), Math.round(parseFloat(fromWei(poolRewardsPerBlock.toString())) * 10));
      //paca is 10% of the weight
      assert.equal(Math.round(postRewarPacaDiff * 10), Math.round(postRewarDiff));

    });
    it("Deposit into ALP and check attributes", async () => {
      alpToDeposit = new web3.utils.BN(toWei(this.sharesToTransfer));

      alpToken = await ERC20.at( (await this.ranch.poolInfo(4)).lpToken);
      await alpToken.approve(this.ranch.address, alpToDeposit, { from: minter});
      await this.ranch.deposit(4, alpToDeposit, { from: minter });
      console.log("ALP share after deposit: ",  fromWei((await this.ranch.poolInfo(4)).allocPoint.toString()));

      //we should now have 0, 2000, 2000, 200, 2000
      await time.advanceBlock();
      block = await web3.eth.getBlock("latest");
      console.log("|||current block: ", block.number);
      preShares0 = fromWei((await this.ranch.poolInfo(4)).allocPoint.toString());
      preReward0 = fromWei((await this.ranch.pendingPaca(4, minter)).toString());
      preSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      preRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      await time.advanceBlock();
      postShares0 = fromWei((await this.ranch.poolInfo(4)).allocPoint.toString());
      postReward0 = fromWei((await this.ranch.pendingPaca(4, minter)).toString());
      postSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      postRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      devPctInv = await this.ranch.devPctInv();
      poolRewardsPerBlock = pacaRewardsPerBlock - pacaRewardsPerBlock / devPctInv;
      console.log("poolRewardsPerBlock: ", fromWei(poolRewardsPerBlock.toString()));

      postRewarPacaDiff = parseFloat(postRewardPaca) - parseFloat(preRewardPaca);
      postRewarDiff = parseFloat(postReward0) - parseFloat(preReward0);
      calculatedRewards = (postRewarDiff) * 3
        + postRewarPacaDiff;

      console.log("totalAllocPoint: ", fromWei((await this.ranch.totalAllocPoint()).toString()));
      assert.equal(Math.round(calculatedRewards), Math.round(parseFloat(fromWei(poolRewardsPerBlock.toString())) * 10));
      //paca is 10% of the weight
      assert.equal(Math.round(postRewarPacaDiff * 10), Math.round(postRewarDiff));

    });
    it("Withdraw ALP and check attributes", async () => {
      alpToWithdraw = new web3.utils.BN(toWei(this.sharesToTransfer));
      alpToWithdraw = alpToWithdraw.div(new web3.utils.BN('2'));
      console.log("ALP shares to withdraw: ", alpToWithdraw.toString());
      await this.ranch.withdraw(4, alpToWithdraw, { from: minter });
      console.log("ALP share after withdraw: ",  fromWei((await this.ranch.poolInfo(4)).allocPoint.toString()));

      //we should now have 0, 2000, 2000, 200, 1000
      await time.advanceBlock();
      block = await web3.eth.getBlock("latest");
      console.log("|||current block: ", block.number);
      preShares0 = fromWei((await this.ranch.poolInfo(4)).allocPoint.toString());
      preReward0 = fromWei((await this.ranch.pendingPaca(4, minter)).toString());
      preSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      preRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      await time.advanceBlock();
      postShares0 = fromWei((await this.ranch.poolInfo(4)).allocPoint.toString());
      postReward0 = fromWei((await this.ranch.pendingPaca(4, minter)).toString());
      postSharesPaca = fromWei((await this.ranch.poolInfo(3)).allocPoint.toString());
      postRewardPaca = fromWei((await this.ranch.pendingPaca(3, minter)).toString());

      devPctInv = await this.ranch.devPctInv();
      poolRewardsPerBlock = pacaRewardsPerBlock - pacaRewardsPerBlock / devPctInv;
      console.log("poolRewardsPerBlock: ", fromWei(poolRewardsPerBlock.toString()));

      postRewarPacaDiff = parseFloat(postRewardPaca) - parseFloat(preRewardPaca);
      postRewarDiff = parseFloat(postReward0) - parseFloat(preReward0);
      calculatedRewards = (postRewarDiff) * 5 // 5000/1000 = 5
        + postRewarPacaDiff;

      console.log("totalAllocPoint: ", fromWei((await this.ranch.totalAllocPoint()).toString()));
      assert.equal(Math.round(calculatedRewards), Math.round(parseFloat(fromWei(poolRewardsPerBlock.toString())) * 10));
      //paca is 5% of the weight
      assert.equal(Math.round(postRewarPacaDiff * 5), Math.round(postRewarDiff));

    });
  });
});
