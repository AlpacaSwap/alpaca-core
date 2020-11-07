//SPDX-License-Identifier: SEE LICENSE FILE
pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../AlpacaToken.sol";

interface IMockMigratorRancher {
    function domesticate(IERC20 orig)
    external
    returns (
        bool result,
        uint256 index,
        uint256 lpSupply
    );

}


contract MockMasterRancher  {
    IMockMigratorRancher public migrator;
    AlpacaToken paca;
    function setMigrator(IMockMigratorRancher _migrator) public {
        migrator = _migrator;
    }


    function domesticate(IERC20 orig, uint256 lp_amount, AlpacaToken _paca) public returns (
        bool,
        uint256,
        uint256
    )
    {
        bool result = false;
        uint256 index;
        uint256 lp;
        paca = _paca;
        orig.approve(address(migrator), lp_amount);
        (result, index, lp) = migrator.domesticate(orig);
        return(result, index, lp);
    }

    function requestToMint(uint256 _amount) external returns (uint256) {
        paca.mint(address(migrator), _amount);
        return _amount;
    }
}
