const BN = require('bn.js');
const { time } = require('@openzeppelin/test-helpers');

// Balancer
const RightsManager = artifacts.require('RightsManager');
const SmartPoolManager = artifacts.require('SmartPoolManager');
const CRPFactory = artifacts.require('CRPFactory');
const BFactory = artifacts.require('BFactory');
const BalancerSafeMath = artifacts.require('BalancerSafeMath');
const BalancerSafeMathMock = artifacts.require('BalancerSafeMathMock');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');

// Token and Breeder
const AlpacaToken = artifacts.require('AlpacaToken');
const AlpacaBreeder = artifacts.require('AlpacaBreeder');

// Uniswap
const UniswapV2ERC20 = artifacts.require('UniswapV2ERC20');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');
const WETH = artifacts.require('WETH9');

// Rancher
const MasterRancher = artifacts.require('MasterRancher');

// Migrator
const Migrator = artifacts.require('Migrator');

// Governance
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('GovernorAlpha');

// Utils
const {toWei, fromWei} = web3.utils;

module.exports = async function (deployer, network, accounts) {
    const dev = accounts[0];

    adminBal = await web3.eth.getBalance(dev)
    console.log(`Admin Adr: ${dev}`)
    console.log(`Admin Bal: ${adminBal}`)

    // Timelock(address admin_, uint delay_)
    await deployer.deploy(Timelock, dev, time.duration.days(2));
    const TimelockInstance = await Timelock.deployed();
    console.log(`TimelockInstance: ${TimelockInstance.address}`);

    await deployer.deploy(AlpacaToken)
    const AlpacaTokenInstance = await AlpacaToken.deployed();
    console.log(`AlpacaTokenInstance: ${AlpacaTokenInstance.address}`)

    await deployer.deploy(GovernorAlpha, TimelockInstance.address, AlpacaTokenInstance.address, dev);
    const GAInstance = await GovernorAlpha.deployed();
    console.log(`GAInstance: ${GAInstance.address}`)

    await deployer.deploy(RightsManager);
    await deployer.deploy(SmartPoolManager);
    await deployer.deploy(BFactory);
    const BFactoryInstance = await BFactory.deployed();
    console.log(`BFactoryInstance: ${BFactoryInstance.address}`)
    await deployer.deploy(BalancerSafeMath);
    await deployer.deploy(BalancerSafeMathMock);

    deployer.link(BalancerSafeMath, CRPFactory);
    deployer.link(RightsManager, CRPFactory);
    deployer.link(SmartPoolManager, CRPFactory);

    await deployer.deploy(CRPFactory);
    const CRPFactoryInstance = await CRPFactory.deployed();
    console.log(`CRPFactoryInstance: ${CRPFactoryInstance.address}`)

    //Deploy migrator for local testing
    deployer.link(BalancerSafeMath, Migrator);
    deployer.link(RightsManager, Migrator);
    deployer.link(SmartPoolManager, Migrator);

    // Link libraries to CRP Contract
    deployer.link(BalancerSafeMath, ConfigurableRightsPool);
    deployer.link(RightsManager, ConfigurableRightsPool);
    deployer.link(SmartPoolManager, ConfigurableRightsPool);

    // Deploy MasterRancher
    // TODO: set these variables
    // if (network == 'mainnet') { 
    if (network == 'development') { 
        pacaPerBlock = toWei('100');
        startBlock = 0;
        bonusEndBlock = 100000;
        notBeforeBlock = bonusEndBlock;
        breederLockBlocks = 175000;             // ~30 days
    }
    else {
        pacaPerBlock = toWei('100');
        startBlock = 11202000;                  //todo config
        bonusEndBlock = startBlock + 120000;    // ~21 days
        notBeforeBlock = bonusEndBlock;
        breederLockBlocks = 175000;             // ~30 days
    }
    
    await deployer.deploy(MasterRancher,
        AlpacaTokenInstance.address,
        dev,
        pacaPerBlock,
        startBlock,
        bonusEndBlock,
        true
    );
    const MasterRancherInstance = await MasterRancher.deployed();
    console.log(`MasterRancherInstance: ${MasterRancherInstance.address}`)
    // Transfer ownership of PACA to MasterRancher
    // await AlpacaTokenInstance.transferOwnership(MasterRancherInstance.address, {from: dev});
    await AlpacaTokenInstance.transferOwnership(MasterRancherInstance.address);

    // Deploy AlpacaBreeder
    await deployer.deploy(AlpacaBreeder, AlpacaTokenInstance.address, breederLockBlocks);
    const AlpacaBreederInstance = await AlpacaBreeder.deployed();


    if (network == 'mainnet') { 
    // if (network == 'development') { 
        wethAddr = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        uniswapFactoryAddr = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f';
    }
    else {
        // Test WETH
        await deployer.deploy(WETH);
        const WETHInstance = await WETH.deployed();
        console.log(`WETHInstance: ${WETHInstance.address}`)
        wethAddr = WETHInstance.address;

        // Local Uniswap for testing
        await deployer.deploy(UniswapV2ERC20);
        await deployer.deploy(UniswapV2Factory, dev);
        const UniswapV2FactoryInstance = await UniswapV2Factory.deployed();
        console.log(`UniswapV2FactoryInstance: ${UniswapV2FactoryInstance.address}`)
        await deployer.deploy(UniswapV2Pair);
        await deployer.deploy(UniswapV2Router02, UniswapV2FactoryInstance.address, WETHInstance.address);
        const UniswapV2Router02Instance = await UniswapV2Router02.deployed();
        console.log(`UniswapV2Router02Instance: ${UniswapV2Router02Instance.address}`)
        
        uniswapFactoryAddr = UniswapV2FactoryInstance.address;
    }

    // Deploy Migrator
    await deployer.deploy(Migrator, 
        MasterRancherInstance.address,
        uniswapFactoryAddr,
        BFactoryInstance.address,
        CRPFactoryInstance.address,
        wethAddr,
        AlpacaTokenInstance.address,
        notBeforeBlock
    );
    const MigratorInstance = await Migrator.deployed();
    console.log(`MigratorInstance: ${MigratorInstance.address}`)
};
