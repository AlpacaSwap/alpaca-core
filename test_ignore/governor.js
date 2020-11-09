const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const AlpacaToken = artifacts.require('AlpacaToken');
const MasterRancher = artifacts.require('MasterRancher');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('GovernorAlpha');
const MockERC20 = artifacts.require('MockERC20');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Governor', ([alice, minter, dev]) => {
    it('should work', async () => {
        this.alpaca = await AlpacaToken.new({ from: alice });
        await this.alpaca.delegate(dev, { from: dev });
        this.ranch = await MasterRancher.new(this.alpaca.address, dev, '110', '0', '0', { from: alice });
        await this.alpaca.transferOwnership(this.ranch.address, { from: alice });
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
        await this.ranch.add('100', this.lp.address, true, { from: alice });
        await this.lp.approve(this.ranch.address, '1000', { from: minter });
        await this.ranch.deposit(0, '100', { from: minter });
        // Perform another deposit to make sure some SUSHIs are minted in that 1 block.
        await this.ranch.deposit(0, '100', { from: minter });
        assert.equal((await this.alpaca.totalSupply()).valueOf(), '110');
        assert.equal((await this.alpaca.balanceOf(minter)).valueOf(), '100');
        assert.equal((await this.alpaca.balanceOf(dev)).valueOf(), '10');
        // Transfer ownership to timelock contract
        this.timelock = await Timelock.new(alice, time.duration.days(2), { from: alice });
        this.gov = await GovernorAlpha.new(this.timelock.address, this.alpaca.address, alice, { from: alice });
        await this.timelock.setPendingAdmin(this.gov.address, { from: alice });
        await this.gov.__acceptAdmin({ from: alice });
        await this.ranch.transferOwnership(this.timelock.address, { from: alice });
        await expectRevert(
            this.ranch.add('100', this.lp2.address, true, { from: alice }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.gov.propose(
                [this.ranch.address], ['0'], ['add(uint256,address,bool)'],
                [encodeParameters(['uint256', 'address', 'bool'], ['100', this.lp2.address, true])],
                'Add LP2',
                { from: alice },
            ),
            'GovernorAlpha::propose: proposer votes below proposal threshold',
        );
        await this.gov.propose(
            [this.ranch.address], ['0'], ['add(uint256,address,bool)'],
            [encodeParameters(['uint256', 'address', 'bool'], ['100', this.lp2.address, true])],
            'Add LP2',
            { from: dev },
        );
        await time.advanceBlock();
        await this.gov.castVote('1', true, { from: dev });
        await expectRevert(this.gov.queue('1'), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
        // GovernorAlpha.votingPeriod() is 17280
        console.log("Advancing 17280 blocks. Will take a while...");
        for (let i = 0; i < 17280; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('1');
        await expectRevert(this.gov.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(3));
        await this.gov.execute('1');
        assert.equal((await this.ranch.poolLength()).valueOf(), '2');
    });
});
