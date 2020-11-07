/* eslint-env es6 */

const BFactory = artifacts.require("BFactory");
const ConfigurableRightsPool = artifacts.require("ConfigurableRightsPool");
const CRPFactory = artifacts.require("CRPFactory");
const TToken = artifacts.require("TToken");
const truffleAssert = require("truffle-assertions");
const { expectRevert, time } = require("@openzeppelin/test-helpers");
const AlpacaToken = artifacts.require("AlpacaToken");
const MasterRancher = artifacts.require("MasterRancher");
const MockERC20 = artifacts.require("MockERC20");
const UniswapV2Pair = artifacts.require("UniswapV2Pair");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const Migrator = artifacts.require("Migrator");
const MockMasterRancher = artifacts.require("MockMasterRancher");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

contract("Migrator", ([alice, bob, dev, minter]) => {
  /*  const admin = accounts[0];
const admin2 = accounts[1];
const admin3 = accounts[2];*/
  console.log = function() {}
  const MAX = web3.utils.toTwosComplement(-1);
  const { toWei, fromWei } = web3.utils;

  let crpFactory;
  let bFactory;
  let crpPool;
  let CRPPOOL;
  let WETH;
  let DAI;
  let XYZ;
  let weth;
  let dai;
  let xyz;

  // These are the intial settings for newCrp:
  const swapFee = 10 ** 15;
  const startWeights = [toWei("12"), toWei("1.5"), toWei("1.5")];
  const startBalances = [toWei("80000"), toWei("40"), toWei("10000")];
  const SYMBOL = "BSP";
  const NAME = "Balancer Pool Token";

  // All off
  const permissions = {
    canPauseSwapping: false,
    canChangeSwapFee: false,
    canChangeWeights: false,
    canAddRemoveTokens: false,
    canWhitelistLPs: false,
    canChangeCap: false,
  };

  beforeEach(async () => {
    this.factory1 = await UniswapV2Factory.new(alice, { from: alice });
    this.factory2 = await UniswapV2Factory.new(alice, { from: alice });
    this.alpaca = await AlpacaToken.new({ from: alice });
    await this.alpaca.mint(minter, "2000000000", {from: alice });
    this.weth = await MockERC20.new("WETH", "WETH", "100000000", {
      from: minter,
    });
    console.log(`weth address: ${this.weth.address}`);
    this.token1 = await MockERC20.new("TOKEN1", "TOKEN1", "1000000000", {
      from: minter,
    });
    console.log(`token1 address: ${this.token1.address}`);
    this.token2 = await MockERC20.new("TOKEN2", "TOKEN2", "1000000000", {
      from: minter,
    });
    console.log(`token2 address: ${this.token2.address}`);
    this.token3 = await MockERC20.new("TOKEN3", "TOKEN3", "1000000000", {
      from: minter,
    });
    console.log(`token3 address: ${this.token3.address}`);
    this.token4 = await MockERC20.new("TOKEN4", "TOKEN4", "1000000000", {
      from: minter,
    });
    console.log(`token4 address: ${this.token4.address}`);

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
      (await this.factory1.createPair(this.weth.address, this.token4.address)).logs[0].args.pair
    );
    this.rancher = await MasterRancher.new(this.alpaca.address, dev, "1000", "0", "100000", { from: alice });

    this.bFactory = await BFactory.new();
    this.crpFactory = await CRPFactory.new();
    this.migrator = await Migrator.new(
      minter,
      this.factory1.address,
      this.bFactory.address,
      this.crpFactory.address,
      this.weth.address,
      this.alpaca.address,
      "0"
    );

  });
  describe('Migrator Safety Check', () => {
  it("domesticate when not rancher", async () => {
    await expectRevert(this.migrator.domesticate(this.lp1.address, { from: alice}), 'you are not the rancher');
    });

    it("domesticate when there is no LP", async () => {
      result = await (this.migrator.domesticate.call(this.lp1.address, { from: minter}));
      assert.isFalse(result.result);
    });

    it("domesticate when WETH isn't a pair", async () => {
      lp5 = await UniswapV2Pair.at(
        (await this.factory1.createPair(this.token3.address, this.token4.address)).logs[0].args.pair
      );
      result = await (this.migrator.domesticate.call(lp5.address, { from: minter}));
      assert.isFalse(result.result);
    });

  });

  describe('Migrate PACA pair Tests', () => {
    it("Check if PACA is correctly inflated", async () => {
      rancher = await MockMasterRancher.new({ from: alice });
      this.migrator = await Migrator.new(
        rancher.address,
        this.factory1.address,
        this.bFactory.address,
        this.crpFactory.address,
        this.weth.address,
        this.alpaca.address,
        "0"
      );


      lpPACA = await UniswapV2Pair.at(
        (await this.factory1.createPair(this.weth.address, this.alpaca.address)).logs[0].args.pair
      );
      await this.alpaca.transfer(lpPACA.address, "1000000000", { from: minter });
      await this.weth.transfer(lpPACA.address, "10000000", { from: minter });
      await lpPACA.mint(minter).then(function (result) {
        console.log("lp1 mint tx hash", result.tx);
      });
      const minted = await lpPACA.balanceOf(minter);
      await lpPACA.transfer(rancher.address, minted, {from: minter});

      await this.alpaca.transferOwnership(rancher.address, { from: alice });
      await rancher.setMigrator(this.migrator.address);
      result = await rancher.domesticate(lpPACA.address, minted, this.alpaca.address, {
        from: minter,
      });
      totalSupply = await this.alpaca.totalSupply().valueOf();
      //total paca: 2000000000
      //inflation: 1000000000
      //total should be 3000000000
      assert.equal(totalSupply.toNumber(), 3000000000);

      wethToken = await this.migrator.omniPool(this.weth.address);
      assert.equal((wethToken.balance).toNumber(), 9999900);


      otherToken = await this.migrator.omniPool(this.alpaca.address);
      totalWeth = await this.migrator.totalWeth()
      //PACA balance = 999990000 + 1000000000
      //wethValue of PACA should be 9999900 * 2 + 100
      //totalWeth = 9999900 * 3 + 100
      console.log("balance", (otherToken.balance).toNumber());
      console.log("wethValue", (otherToken.wethValue).toNumber());
      console.log("totalWeth", totalWeth.toNumber());
      assert.equal((otherToken.balance).toNumber(), 999990000 + 1000000000);
      assert.equal((otherToken.wethValue).toNumber(), 9999900 * 2 + 100 );
      assert.equal(totalWeth.toNumber(), 9999900 * 3 + 100);

    });


  });


  it("ranch establishment test", async () => {
    //transfer ownership to rancher
    await this.alpaca.transferOwnership(this.rancher.address, { from: alice });
    await this.rancher.add("100", this.lp1.address, true, { from: alice });
    //deposit tokens into LP to mint LPs
    await this.token1.transfer(this.lp1.address, "100000000", { from: minter });
    await this.weth.transfer(this.lp1.address, "10000000", { from: minter });
    await this.lp1.mint(minter).then(function (result) {
      console.log("lp1 mint tx hash", result.tx);
    });
    const minted1 = await this.lp1.balanceOf(minter);
    console.log(`minted1 lp: ${minted1}`);
    await this.lp1.approve(this.migrator.address, minted1, { from: minter });
    const totalSupply1 = await this.lp1.totalSupply().valueOf();
    console.log(`minted1 totalSupply: ${totalSupply1}`);

    await this.token2.transfer(this.lp2.address, "200000000", { from: minter });
    await this.weth.transfer(this.lp2.address, "10000000", { from: minter });
    await this.lp2.mint(minter).then(function (result) {
      console.log("lp2 mint tx hash", result.tx);
    });
    const minted2 = await this.lp2.balanceOf(minter);
    console.log(`minted2 lp: ${minted2}`);
    await this.lp2.approve(this.migrator.address, minted2, { from: minter });
    const totalSupply2 = await this.lp2.totalSupply().valueOf();
    console.log(`minted2 totalSupply: ${totalSupply2}`);

    await this.token3.transfer(this.lp3.address, "500000000", { from: minter });
    await this.weth.transfer(this.lp3.address, "10000000", { from: minter });
    await this.lp3.mint(minter).then(function (result) {
      console.log("lp3 mint tx hash", result.tx);
    });
    const minted3 = await this.lp3.balanceOf(minter);
    console.log(`minted3 lp: ${minted3}`);
    await this.lp3.approve(this.migrator.address, minted3, { from: minter });
    const totalSupply3 = await this.lp3.totalSupply().valueOf();
    console.log(`minted3 totalSupply: ${totalSupply3}`);

    await this.token4.transfer(this.lp4.address, "800000000", { from: minter });
    await this.weth.transfer(this.lp4.address, "10000000", { from: minter });
    await this.lp4.mint(minter).then(function (result) {
      console.log("lp4 mint tx hash", result.tx);
    });
    const minted4 = await this.lp4.balanceOf(minter);
    console.log(`minted4 lp: ${minted4}`);
    await this.lp4.approve(this.migrator.address, minted4, { from: minter });
    const totalSupply4 = await this.lp4.totalSupply().valueOf();
    console.log(`minted4 totalSupply: ${totalSupply4}`);

    // await this.migrator.setWeth(this.weth.address);
    assert.equal((await this.migrator.wethAddr()).valueOf(), this.weth.address);
    //await expectRevert(this.migrator.domesticate(this.lp1.address, { from: minter}), 'you are not the rancher');
    let fake_result = await this.migrator.domesticate.call(this.lp1.address, {
      from: minter,
    });
    assert.equal(minted1.toNumber(), fake_result.legacyTotalsupply.toNumber());
    assert.equal(1, fake_result.index.toNumber());
    console.log("tx result", fake_result);
    let result = await this.migrator.domesticate(this.lp1.address, {
      from: minter,
    });
    console.log("tx result", result);
    console.log("domesticate lp1 tx hash", result.tx);
    console.log("otherTokenAmount:", result.logs[0].args.tokenAmount.toNumber());
    console.log("wethAmount:", result.logs[0].args.wethAmount.toNumber());
    console.log("wethToken total balance", result.logs[1].args.wethBalance.toNumber());
    console.log("otherToken total balance:", result.logs[1].args.tokenBalance.toNumber());
    console.log("otherToken wethValue:", result.logs[1].args.tokenWethValue.toNumber());
    let calculated_total_weth = result.logs[0].args.wethAmount.toNumber();
    calculated_total_weth = calculated_total_weth * 2;
    let totalWeth = (await this.migrator.totalWeth()).toNumber();
    console.log("total weth: ", totalWeth);
    console.log("calculated_total_weth: ", calculated_total_weth);
    assert.equal(calculated_total_weth, totalWeth);
    let current_weth_value = await this.migrator.omniPool(this.weth.address);

    console.log("current_weth_balance", current_weth_value.balance.toNumber());
    console.log("current_weth_value", current_weth_value.wethValue.toNumber());
    //assert.equal(totalWeth.toNumber(), result.logs[0].args.wethAmount.toNumber() * 2);
    result = await this.migrator.domesticate(this.lp2.address, { from: minter });
    console.log("domesticate lp2 tx hash", result.tx);
    console.log("otherTokenAmount:", result.logs[0].args.tokenAmount.toNumber());
    console.log("wethAmount:", result.logs[0].args.wethAmount.toNumber());
    console.log("wethToken total balance", result.logs[1].args.wethBalance.toNumber());
    console.log("otherToken total balance:", result.logs[1].args.tokenBalance.toNumber());
    console.log("otherToken wethValue:", result.logs[1].args.tokenWethValue.toNumber());
    calculated_total_weth = calculated_total_weth + result.logs[0].args.wethAmount.toNumber() * 2;
    totalWeth = (await this.migrator.totalWeth()).toNumber();
    console.log("total weth: ", totalWeth);
    console.log("calculated_total_weth: ", calculated_total_weth);
    assert.equal(calculated_total_weth, totalWeth, "totalWeth is not correct");
    current_weth_value = await this.migrator.omniPool(this.weth.address);
    current_weth_value = current_weth_value.wethValue.toNumber();
    assert.equal(calculated_total_weth / 2, current_weth_value, "wethValue is not correct");

    result = await this.migrator.domesticate(this.lp3.address, { from: minter });
    console.log("domesticate lp3 tx hash", result.tx);
    console.log("otherTokenAmount:", result.logs[0].args.tokenAmount.toNumber());
    console.log("wethAmount:", result.logs[0].args.wethAmount.toNumber());
    console.log("wethToken total balance", result.logs[1].args.wethBalance.toNumber());
    console.log("otherToken total balance:", result.logs[1].args.tokenBalance.toNumber());
    console.log("otherToken wethValue:", result.logs[1].args.tokenWethValue.toNumber());
    calculated_total_weth = calculated_total_weth + result.logs[0].args.wethAmount.toNumber() * 2;
    totalWeth = (await this.migrator.totalWeth()).toNumber();
    console.log("total weth: ", totalWeth);
    console.log("calculated_total_weth: ", calculated_total_weth);
    assert.equal(calculated_total_weth, totalWeth, "totalWeth is not correct");
    current_weth_value = await this.migrator.omniPool(this.weth.address);
    current_weth_value = current_weth_value.wethValue.toNumber();
    assert.equal(calculated_total_weth / 2, current_weth_value, "wethValue is not correct");

    result = await this.migrator.domesticate(this.lp4.address, { from: minter });
    console.log("domesticate lp4 tx hash", result.tx);
    console.log("otherTokenAmount:", result.logs[0].args.tokenAmount.toNumber());
    console.log("wethAmount:", result.logs[0].args.wethAmount.toNumber());
    console.log("wethToken total balance", result.logs[1].args.wethBalance.toNumber());
    console.log("otherToken total balance:", result.logs[1].args.tokenBalance.toNumber());
    console.log("otherToken wethValue:", result.logs[1].args.tokenWethValue.toNumber());
    calculated_total_weth = calculated_total_weth + result.logs[0].args.wethAmount.toNumber() * 2;
    totalWeth = (await this.migrator.totalWeth()).toNumber();
    console.log("total weth: ", totalWeth);
    console.log("calculated_total_weth: ", calculated_total_weth);
    assert.equal(calculated_total_weth, totalWeth, "totalWeth is not correct");
    current_weth_value = await this.migrator.omniPool(this.weth.address);
    current_weth_value = current_weth_value.wethValue.toNumber();
    assert.equal(calculated_total_weth / 2, current_weth_value, "wethValue is not correct");
    await this.migrator.establishTokenSetting({ from: minter });
    await this.migrator.establishRanch({ from: minter });
    await this.migrator.startRanch(minter, toWei("0.75"), minter, toWei("0.005"), this.weth.address, dev, {
      from: minter,
    });

    let crpPoolAddr = await this.migrator.pacaOmniPool();
    console.log("crp address: ", crpPoolAddr);

    this.crpPool = await ConfigurableRightsPool.at(crpPoolAddr);
    let bpool = await this.crpPool.bPool();
    console.log("bpool address: ", bpool);
    let crp_weth = await this.weth.balanceOf(bpool);
    console.log("weth in crp:", crp_weth.toNumber());
    assert.equal(current_weth_value, crp_weth.toNumber());
  });
});
