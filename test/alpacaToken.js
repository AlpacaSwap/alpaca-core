const { expectRevert } = require('@openzeppelin/test-helpers');
const AlpacaToken = artifacts.require('AlpacaToken');

contract('AlpacaToken', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.alpaca = await AlpacaToken.new({ from: alice });
    });

    it('should have correct name and symbol and decimal', async () => {
        const name = await this.alpaca.name();
        const symbol = await this.alpaca.symbol();
        const decimals = await this.alpaca.decimals();
        assert.equal(name.valueOf(), 'AlpacaToken');
        assert.equal(symbol.valueOf(), 'PACA');
        assert.equal(decimals.valueOf(), '18');
    });

    it('should only allow owner to mint token', async () => {
        await this.alpaca.mint(alice, '100', { from: alice });
        await this.alpaca.mint(bob, '1000', { from: alice });
        await expectRevert(
            this.alpaca.mint(carol, '1000', { from: bob }),
            'Ownable: caller is not the owner',
        );
        const totalSupply = await this.alpaca.totalSupply();
        const aliceBal = await this.alpaca.balanceOf(alice);
        const bobBal = await this.alpaca.balanceOf(bob);
        const carolBal = await this.alpaca.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '100');
        assert.equal(bobBal.valueOf(), '1000');
        assert.equal(carolBal.valueOf(), '0');
    });

    it('should transfer tokens properly', async () => {
        await this.alpaca.mint(alice, '100', { from: alice });
        await this.alpaca.mint(bob, '1000', { from: alice });
        await this.alpaca.transfer(carol, '10', { from: alice });
        await this.alpaca.transfer(carol, '100', { from: bob });
        const totalSupply = await this.alpaca.totalSupply();
        const aliceBal = await this.alpaca.balanceOf(alice);
        const bobBal = await this.alpaca.balanceOf(bob);
        const carolBal = await this.alpaca.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '90');
        assert.equal(bobBal.valueOf(), '900');
        assert.equal(carolBal.valueOf(), '110');
    });

    it('should transfer tokens from addresses properly', async () => {
        await this.alpaca.mint(alice, '100', { from: alice });
        await this.alpaca.mint(bob, '1000', { from: alice });

        await this.alpaca.approve(carol, '10', { from: alice });
        await this.alpaca.approve(carol, '100', { from: bob });

        aliceAllowance = await this.alpaca.allowance(alice, carol);
        bobAllowance = await this.alpaca.allowance(bob, carol);
        assert.equal(aliceAllowance, '10');
        assert.equal(bobAllowance, '100');

        await this.alpaca.transferFrom(alice, carol, '10', { from: carol });
        await this.alpaca.transferFrom(bob, carol, '100', { from: carol });
        const totalSupply = await this.alpaca.totalSupply();
        const aliceBal = await this.alpaca.balanceOf(alice);
        const bobBal = await this.alpaca.balanceOf(bob);
        const carolBal = await this.alpaca.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '90');
        assert.equal(bobBal.valueOf(), '900');
        assert.equal(carolBal.valueOf(), '110');

        aliceAllowance = await this.alpaca.allowance(alice, carol);
        bobAllowance = await this.alpaca.allowance(bob, carol);
        assert.equal(aliceAllowance, '0');
        assert.equal(bobAllowance, '0');

    });

    it('should fail if you try to do bad transfers', async () => {
        await this.alpaca.mint(alice, '100', { from: alice });
        await expectRevert(
            this.alpaca.transfer(carol, '110', { from: alice }),
            'ERC20: transfer amount exceeds balance',
        );
        await expectRevert(
            this.alpaca.transfer(carol, '1', { from: bob }),
            'ERC20: transfer amount exceeds balance',
        );
    });
  });
