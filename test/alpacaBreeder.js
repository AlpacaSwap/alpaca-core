const {expectRevert, time} = require("@openzeppelin/test-helpers");
const { assert } = require("chai");
const AlpacaToken = artifacts.require('AlpacaToken');
const AlpacaBreeder = artifacts.require('AlpacaBreeder');
const BN = require('bn.js');

contract('AlpacaBreeder', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.alpaca = await AlpacaToken.new({ from: alice });
        this.breeder = await AlpacaBreeder.new(this.alpaca.address, 0, { from: alice });
        this.alpaca.mint(alice, '100', { from: alice });
        this.alpaca.mint(bob, '100', { from: alice });
        this.alpaca.mint(carol, '100', { from: alice });
    });

    it('should not allow enter if not enough approve', async () => {
        await expectRevert(
            this.breeder.enter('100', { from: alice }),
            'ERC20: transfer amount exceeds allowance',
        );
        await this.alpaca.approve(this.breeder.address, '50', { from: alice });
        await expectRevert(
            this.breeder.enter('100', { from: alice }),
            'ERC20: transfer amount exceeds allowance',
        );
        await this.alpaca.approve(this.breeder.address, '100', { from: alice });
        await this.breeder.enter('100', { from: alice });
        assert.equal((await this.breeder.balanceOf(alice)).valueOf(), '100');
    });

    it('should not allow withraw more than what you have', async () => {
        await this.alpaca.approve(this.breeder.address, '100', { from: alice });
        await this.breeder.enter('100', { from: alice });
        await expectRevert(
            this.breeder.leave('200', { from: alice }),
            'ERC20: burn amount exceeds balance',
        );
    });

    it('should work with more than one participant', async () => {
        await this.alpaca.approve(this.breeder.address, '100', { from: alice });
        await this.alpaca.approve(this.breeder.address, '100', { from: bob });
        
        // Alice enters and gets 20 shares. Bob enters and gets 10 shares.
        await this.breeder.enter('20', { from: alice });
        await this.breeder.enter('10', { from: bob });
        assert.equal((await this.breeder.balanceOf(alice)).valueOf(), '20');
        assert.equal((await this.breeder.balanceOf(bob)).valueOf(), '10');
        assert.equal((await this.alpaca.balanceOf(this.breeder.address)).valueOf(), '30');
        
        // AlpacaBreeder get 20 more PACAs from an external source.
        await this.alpaca.transfer(this.breeder.address, '20', { from: carol });
        
        // Alice deposits 10 more PACAs. She should receive 10*30/50 = 6 shares.
        await this.breeder.enter('10', { from: alice });
        assert.equal((await this.breeder.balanceOf(alice)).valueOf(), '26');
        assert.equal((await this.breeder.balanceOf(bob)).valueOf(), '10');
        
        // Bob withdraws 5 shares. He should receive 5*60/36 = 8 shares
        await this.breeder.leave('5', { from: bob });
        assert.equal((await this.breeder.balanceOf(alice)).valueOf(), '26');
        assert.equal((await this.breeder.balanceOf(bob)).valueOf(), '5');
        assert.equal((await this.alpaca.balanceOf(this.breeder.address)).valueOf(), '52');
        assert.equal((await this.alpaca.balanceOf(alice)).valueOf(), '70');
        assert.equal((await this.alpaca.balanceOf(bob)).valueOf(), '98');
    });
});


contract('AlpacaBreederTimelock', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.alpaca = await AlpacaToken.new({ from: alice });
        this.lockBlocks = 100;
        this.breeder = await AlpacaBreeder.new(this.alpaca.address, this.lockBlocks, { from: alice });
        this.alpaca.mint(alice, '100', { from: alice });
        this.alpaca.mint(bob, '100', { from: alice });
        // this.alpaca.mint(carol, '100', { from: alice });
    });

    it('should give correct timelock', async () => {
        await this.alpaca.approve(this.breeder.address, '100', { from: alice });
        await this.breeder.enter('100', { from: alice });
        enterBlock = await time.latestBlock();
        timeLock = await this.breeder.timelock(alice);

        assert(enterBlock.toNumber() + this.lockBlocks == timeLock.toNumber())
    });

    it('should not allow withraw before timelock', async () => {
        await this.alpaca.approve(this.breeder.address, '100', { from: alice });
        await this.breeder.enter('100', { from: alice });
        enterBlock = await time.latestBlock();
        timeLock = await this.breeder.timelock(alice);
        await expectRevert(
            this.breeder.leave('100', { from: alice }),
            'error: cannot leave breeder until end of breeding period',
        );
    });

    it('should be able to withraw after timelock expires', async () => {
        await this.alpaca.approve(this.breeder.address, '100', { from: alice });
        await this.breeder.enter('100', { from: alice });
        enterBlock = await time.latestBlock();
        timeLock = await this.breeder.timelock(alice);
        await time.advanceBlockTo(timeLock.toString());
        await this.breeder.leave('100', { from: alice });
        assert.equal((await this.breeder.balanceOf(alice)).valueOf(), '0');
    });

    it('depositing more should reset timelock', async () => {
        await this.alpaca.approve(this.breeder.address, '100', { from: alice });
        await this.breeder.enter('50', { from: alice });
        enterBlock1 = await time.latestBlock();
        timeLock1 = await this.breeder.timelock(alice);

        // advance 10 blocks
        await time.advanceBlockTo(enterBlock1.toNumber() + 10);

        await this.breeder.enter('50', { from: alice });
        enterBlock2 = await time.latestBlock();
        timeLock2 = await this.breeder.getUnlockBlock(alice);

        assert(enterBlock2.toNumber() + this.lockBlocks == timeLock2.toNumber())
        assert(timeLock1.toNumber() + 11 == timeLock2.toNumber())
    });
});
