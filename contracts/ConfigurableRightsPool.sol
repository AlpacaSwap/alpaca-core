// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

// Imports

import "./IBFactory.sol";
import "./PCToken.sol";
import "./utils/BalancerReentrancyGuard.sol";
import "./utils/BalancerOwnable.sol";

// Interfaces

// Libraries
import { RightsManager } from "../libraries/RightsManager.sol";
import "../libraries/SmartPoolManager.sol";
// import "../libraries/SafeApprove.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

// Contracts

/**
 * @author Balancer Labs
 * @title Smart Pool with customizable features
 * @notice PCToken is the "Balancer Smart Pool" token (transferred upon finalization)
 * @dev Rights are defined as follows (index values into the array)
 *      0: canPauseSwapping - can setPublicSwap back to false after turning it on
 *                            by default, it is off on initialization and can only be turned on
 *      1: canChangeSwapFee - can setSwapFee after initialization (by default, it is fixed at create time)
 *      2: canChangeWeights - can bind new token weights (allowed by default in base pool)
 *      3: canAddRemoveTokens - can bind/unbind tokens (allowed by default in base pool)
 *      4: canWhitelistLPs - can restrict LPs to a whitelist
 *      5: canChangeCap - can change the BSP cap (max # of pool tokens)
 *
 * Note that functions called on bPool and bFactory may look like internal calls,
 *   but since they are contracts accessed through an interface, they are really external.
 * To make this explicit, we could write "IBPool(address(bPool)).function()" everywhere,
 *   instead of "bPool.function()".
 */
contract ConfigurableRightsPool is PCToken, BalancerOwnable, BalancerReentrancyGuard {
    using BalancerSafeMath for uint;
    using SafeERC20 for IERC20;

    // Type declarations

    struct PoolParams {
        // Balancer Pool Token (representing shares of the pool)
        string poolTokenSymbol;
        string poolTokenName;
        // Tokens inside the Pool
        address[] constituentTokens;
        uint[] tokenBalances;
        uint[] tokenWeights;
        uint swapFee;
    }

    // State variables

    IBFactory public bFactory;
    IBPool public bPool;

    // Struct holding the rights configuration
    RightsManager.Rights public rights;

    // Hold the parameters used in updateWeightsGradually
    SmartPoolManager.GradualUpdateParams public gradualUpdate;

    // This is for adding a new (currently unbound) token to the pool
    // It's a two-step process: commitAddToken(), then applyAddToken()
    SmartPoolManager.NewTokenParams public newToken;

    // Fee is initialized on creation, and can be changed if permission is set
    // Only needed for temporary storage between construction and createPool
    // Thereafter, the swap fee should always be read from the underlying pool
    uint private _initialSwapFee;

    // Store the list of tokens in the pool, and balances
    // NOTE that the token list is *only* used to store the pool tokens between
    //   construction and createPool - thereafter, use the underlying BPool's list
    //   (avoids synchronization issues)
    address[] private _initialTokens;
    uint[] private _initialBalances;

    // Enforce a minimum time between the start and end blocks
    uint public minimumWeightChangeBlockPeriod;
    // Enforce a mandatory wait time between updates
    // This is also the wait time between committing and applying a new token
    uint public addTokenTimeLockInBlocks;


    // Fee payout settings
    address public feeTo;
    uint public fracFeePaidOut;  // fraction of fee paid out from pool
    address public exitFeeTo;
    // Token that LP shares to be paid out should be converted to
    // Set to address(0) if we want payout LP shares instead
    address public payoutToken;

    // Event declarations

    // Anonymous logger event - can only be filtered by contract address

    event LogCall(
        bytes4  indexed sig,
        address indexed caller,
        bytes data
    ) anonymous;

    event LogJoin(
        address indexed caller,
        address indexed tokenIn,
        uint tokenAmountIn
    );

    event LogExit(
        address indexed caller,
        address indexed tokenOut,
        uint tokenAmountOut
    );

    event CapChanged(
        address indexed caller,
        uint oldCap,
        uint newCap
    );

    event NewTokenCommitted(
        address indexed token,
        address indexed pool,
        address indexed caller
    );

    event LogFeeMint(
        address indexed feeTo,
        uint shares
    );

    // event EventPrint(string printStr);

    // Modifiers

    modifier logs() {
        emit LogCall(msg.sig, msg.sender, msg.data);
        _;
    }

    // Mark functions that require delegation to the underlying Pool
    modifier needsBPool() {
        require(address(bPool) != address(0), "ERR_NOT_CREATED");
        _;
    }

    modifier lockUnderlyingPool() {
        // Turn off swapping on the underlying pool during joins
        // Otherwise tokens with callbacks would enable attacks involving simultaneous swaps and joins
        bool origSwapState = bPool.isPublicSwap();
        bPool.setPublicSwap(false);
        _;
        bPool.setPublicSwap(origSwapState);
    }

    // Default values for these variables (used only in updateWeightsGradually), set in the constructor
    // Pools without permission to update weights cannot use them anyway, and should call
    //   the default createPool() function.
    // To override these defaults, pass them into the overloaded createPool()
    // Period is in blocks; 500 blocks ~ 2 hours; 90,000 blocks ~ 2 weeks
    uint public constant DEFAULT_MIN_WEIGHT_CHANGE_BLOCK_PERIOD = 90000;
    uint public constant DEFAULT_ADD_TOKEN_TIME_LOCK_IN_BLOCKS = 500;

    // Function declarations

    /**
     * @notice Construct a new Configurable Rights Pool (wrapper around BPool)
     * @dev _initialTokens and _swapFee are only used for temporary storage between construction
     *      and create pool, and should not be used thereafter! _initialTokens is destroyed in
     *      createPool to prevent this, and _swapFee is kept in sync (defensively), but
     *      should never be used except in this constructor and createPool()
     * @param factoryAddress - the BPoolFactory used to create the underlying pool
     * @param poolParams - struct containing pool parameters
     * @param rightsStruct - Set of permissions we are assigning to this smart pool
     */
    constructor(
        address factoryAddress,
        PoolParams memory poolParams,
        RightsManager.Rights memory rightsStruct
    )
        public
        PCToken(poolParams.poolTokenSymbol, poolParams.poolTokenName)
    {
        // We'll do the checks before calling the constructor in Migrator
        // // We don't have a pool yet; check now or it will fail later (in order of likelihood to fail)
        // // (and be unrecoverable if they don't have permission set to change it)
        // // Most likely to fail, so check first
        // require(poolParams.swapFee >= BalancerConstants.MIN_FEE, "ERR_INVALID_SWAP_FEE");
        // require(poolParams.swapFee <= BalancerConstants.MAX_FEE, "ERR_INVALID_SWAP_FEE");

        // // Arrays must be parallel
        // require(poolParams.tokenBalances.length == poolParams.constituentTokens.length, "ERR_START_BALANCES_MISMATCH");
        // require(poolParams.tokenWeights.length == poolParams.constituentTokens.length, "ERR_START_WEIGHTS_MISMATCH");
        // // Cannot have too many or too few - technically redundant, since BPool.bind() would fail later
        // // But if we don't check now, we could have a useless contract with no way to create a pool

        // require(poolParams.constituentTokens.length >= BalancerConstants.MIN_ASSET_LIMIT, "ERR_TOO_FEW_TOKENS");
        // No bound on max tokens in Alpaca
        // Governance determines how many and which tokens are included
        // require(poolParams.constituentTokens.length <= BalancerConstants.MAX_ASSET_LIMIT, "ERR_TOO_MANY_TOKENS");
        // There are further possible checks (e.g., if they use the same token twice), but
        // we can let bind() catch things like that (i.e., not things that might reasonably work)

        SmartPoolManager.verifyTokenCompliance(poolParams.constituentTokens);

        bFactory = IBFactory(factoryAddress);
        rights = rightsStruct;
        _initialTokens = poolParams.constituentTokens;
        _initialBalances = poolParams.tokenBalances;
        _initialSwapFee = poolParams.swapFee;

        // These default block time parameters can be overridden in createPool
        minimumWeightChangeBlockPeriod = DEFAULT_MIN_WEIGHT_CHANGE_BLOCK_PERIOD;
        addTokenTimeLockInBlocks = DEFAULT_ADD_TOKEN_TIME_LOCK_IN_BLOCKS;
        
        gradualUpdate.startWeights = poolParams.tokenWeights;
        // Initializing (unnecessarily) for documentation - 0 means no gradual weight change has been initiated
        gradualUpdate.startBlock = 0;

        // Future: add new config variables to constructor
        // setFeeTo(_feeTo);
        // setFracFeePaidOut(_feeToPct);
        // setPayoutToken(_payOutToken);
        // setExitFee(_exitFee);
        // setExitFeeTo(_exitFeeTo);
        // setController(rancher);
    }

    // External functions

    /**
     * @notice Set the swap fee on the underlying pool
     * @dev Keep the local version and core in sync (see below)
     *      bPool is a contract interface; function calls on it are external
     * @param swapFee in Wei
     */
    function setSwapFee(uint swapFee)
        external
        logs
        lock
        onlyOwner
        needsBPool
        virtual
    {
        // require(rights.canChangeSwapFee, "ERR_NOT_CONFIGURABLE_SWAP_FEE");

        // Future: make _mintFee() a decorator
        _mintFee();

        // Underlying pool will check against min/max fee
        bPool.setSwapFee(swapFee);
    }

    /**
     * @notice Set the exit fee on the underlying pool
     * @dev _mintFee() included as a protective measure
     * @param exitFee in Wei
     */
    function setExitFee(uint exitFee)
        external
        logs
        lock
        onlyOwner
        needsBPool
        virtual
    {
        _mintFee();
        // Underlying pool will check against min/max fee
        bPool.setExitFee(exitFee);
    }

    /**
     * @notice Getter for the publicSwap field on the underlying pool
     * @dev viewLock, because setPublicSwap is lock
     *      bPool is a contract interface; function calls on it are external
     * @return Current value of isPublicSwap
     */
    function isPublicSwap()
        external
        view
        viewlock
        needsBPool
        virtual
        returns (bool)
    {
        return bPool.isPublicSwap();
    }



    /**
     * @notice Set the public swap flag on the underlying pool
     * @dev If this smart pool has canPauseSwapping enabled, we can turn publicSwap off if it's already on
     *      Note that if they turn swapping off - but then finalize the pool - finalizing will turn the
     *      swapping back on. They're not supposed to finalize the underlying pool... would defeat the
     *      smart pool functions. (Only the owner can finalize the pool - which is this contract -
     *      so there is no risk from outside.)
     *
     *      bPool is a contract interface; function calls on it are external
     * @param publicSwap new value of the swap
     */
    function setPublicSwap(bool publicSwap)
        external
        logs
        lock
        onlyOwner
        needsBPool
        virtual
    {
        // require(rights.canPauseSwapping, "ERR_NOT_PAUSABLE_SWAP");

        bPool.setPublicSwap(publicSwap);
    }

    /**
     * @notice Create a new Smart Pool - and set the block period time parameters
     * @dev Initialize the swap fee to the value provided in the CRP constructor
     *      Can be changed if the canChangeSwapFee permission is enabled
     *      Time parameters will be fixed at these values
     *
     *      If this contract doesn't have canChangeWeights permission - or you want to use the default
     *      values, the block time arguments are not needed, and you can just call the single-argument
     *      createPool()
     * @param initialSupply - Starting token balance
     * @param minimumWeightChangeBlockPeriodParam - Enforce a minimum time between the start and end blocks
     * @param addTokenTimeLockInBlocksParam - Enforce a mandatory wait time between updates
     *                                   This is also the wait time between committing and applying a new token
     */
    function createPool(
        uint initialSupply,
        uint minimumWeightChangeBlockPeriodParam,
        uint addTokenTimeLockInBlocksParam
    )
        external
        onlyOwner
        logs
        lock
        virtual
    {
        require (minimumWeightChangeBlockPeriodParam >= addTokenTimeLockInBlocksParam,
                "ERR_INCONSISTENT_TOKEN_TIME_LOCK");
 
        minimumWeightChangeBlockPeriod = minimumWeightChangeBlockPeriodParam;
        addTokenTimeLockInBlocks = addTokenTimeLockInBlocksParam;

        createPoolInternal(initialSupply);
    }

    /**
     * @notice Create a new Smart Pool
     * @dev Delegates to internal function
     * @param initialSupply starting token balance
     */
    function createPool(uint initialSupply)
        external
        onlyOwner
        logs
        lock
        virtual
    {
        createPoolInternal(initialSupply);
    }

    /**
     * @notice Update the weight of an existing token
     * @dev Notice Balance is not an input (like with rebind on BPool) since we will require prices not to change
     *      This is achieved by forcing balances to change proportionally to weights, so that prices don't change
     *      If prices could be changed, this would allow the controller to drain the pool by arbing price changes
     * @param token - token to be reweighted
     * @param newWeight - new weight of the token
    */
    function updateWeight(address token, uint newWeight)
        external
        logs
        lock
        onlyOwner
        needsBPool
        virtual
    {
        // require(rights.canChangeWeights, "ERR_NOT_CONFIGURABLE_WEIGHTS");

        // We don't want people to set weights manually if there's a block-based update in progress
        require(gradualUpdate.startBlock == 0, "ERR_NO_UPDATE_DURING_GRADUAL");

        _mintFee();

        // Delegate to library to save space
        SmartPoolManager.updateWeight(IConfigurableRightsPool(address(this)), bPool, token, newWeight);
    }

    /**
     * @notice Update weights in a predetermined way, between startBlock and endBlock,
     *         through external calls to pokeWeights
     * @dev Must call pokeWeights at least once past the end for it to do the final update
     *      and enable calling this again.
     *      It is possible to call updateWeightsGradually during an update in some use cases
     *      For instance, setting newWeights to currentWeights to stop the update where it is
     * @param newWeights - final weights we want to get to. Note that the ORDER (and number) of
     *                     tokens can change if you have added or removed tokens from the pool
     *                     It ensures the counts are correct, but can't help you with the order!
     *                     You can get the underlying BPool (it's public), and call 
     *                     getCurrentTokens() to see the current ordering, if you're not sure
     * @param startBlock - when weights should start to change
     * @param endBlock - when weights will be at their final values
    */
    function updateWeightsGradually(
        uint[] calldata newWeights,
        uint startBlock,
        uint endBlock
    )
        external
        logs
        lock
        onlyOwner
        needsBPool
        virtual
    {
        // require(rights.canChangeWeights, "ERR_NOT_CONFIGURABLE_WEIGHTS");
         // Don't start this when we're in the middle of adding a new token
        require(!newToken.isCommitted, "ERR_PENDING_TOKEN_ADD");
        
        _mintFee();

        // Library computes the startBlock, computes startWeights as the current
        // denormalized weights of the core pool tokens.
        SmartPoolManager.updateWeightsGradually(
            bPool,
            gradualUpdate,
            newWeights,
            startBlock,
            endBlock,
            minimumWeightChangeBlockPeriod
        );
    }

    /**
     * @notice External function called to make the contract update weights according to plan
     * @dev Still works if we poke after the end of the period; also works if the weights don't change
     *      Resets if we are poking beyond the end, so that we can do it again
    */
    function pokeWeights()
        external
        logs
        lock
        needsBPool
        virtual
    {
        // require(rights.canChangeWeights, "ERR_NOT_CONFIGURABLE_WEIGHTS");

        _mintFee();

        // Delegate to library to save space
        SmartPoolManager.pokeWeights(bPool, gradualUpdate);
    }

    /**
     * @notice Schedule (commit) a token to be added; must call applyAddToken after a fixed
     *         number of blocks to actually add the token
     *
     * @dev The purpose of this two-stage commit is to give warning of a potentially dangerous
     *      operation. A malicious pool operator could add a large amount of a low-value token,
     *      then drain the pool through price manipulation. Of course, there are many
     *      legitimate purposes, such as adding additional collateral tokens.
     *
     * @param token - the token to be added
     * @param balance - how much to be added
     * @param denormalizedWeight - the desired token weight
     */
    function commitAddToken(
        address token,
        uint balance,
        uint denormalizedWeight
    )
        external
        logs
        lock
        onlyOwner
        needsBPool
        virtual
    {
        // require(rights.canAddRemoveTokens, "ERR_CANNOT_ADD_REMOVE_TOKENS");

        // Can't do this while a progressive update is happening
        require(gradualUpdate.startBlock == 0, "ERR_NO_UPDATE_DURING_GRADUAL");

        SmartPoolManager.verifyTokenCompliance(token);

        emit NewTokenCommitted(token, address(this), msg.sender);

        // Delegate to library to save space
        SmartPoolManager.commitAddToken(
            bPool,
            token,
            balance,
            denormalizedWeight,
            newToken
        );
    }

    /**
     * @notice Add the token previously committed (in commitAddToken) to the pool
     */
    function applyAddToken()
        external
        logs
        lock
        onlyOwner
        needsBPool
        virtual
    {
        // require(rights.canAddRemoveTokens, "ERR_CANNOT_ADD_REMOVE_TOKENS");

        _mintFee();

        // Delegate to library to save space
        SmartPoolManager.applyAddToken(
            IConfigurableRightsPool(address(this)),
            bPool,
            addTokenTimeLockInBlocks,
            newToken
        );
    }

     /**
     * @notice Remove a token from the pool
     * @dev bPool is a contract interface; function calls on it are external
     * @param token - token to remove
     */
    function removeToken(address token)
        external
        logs
        lock
        onlyOwner
        needsBPool
    {
        // It's possible to have remove rights without having add rights
        // require(rights.canAddRemoveTokens,"ERR_CANNOT_ADD_REMOVE_TOKENS");
        // After createPool, token list is maintained in the underlying BPool
        require(!newToken.isCommitted, "ERR_REMOVE_WITH_ADD_PENDING");
        // Prevent removing during an update (or token lists can get out of sync)
        require(gradualUpdate.startBlock == 0, "ERR_NO_UPDATE_DURING_GRADUAL");

        _mintFee();

        // Delegate to library to save space
        SmartPoolManager.removeToken(IConfigurableRightsPool(address(this)), bPool, token);
    } 

    /**
     * @notice Join a pool
     * @dev Emits a LogJoin event (for each token)
     *      bPool is a contract interface; function calls on it are external
     * @param poolAmountOut - number of pool tokens to receive
     * @param maxAmountsIn - Max amount of asset tokens to spend
     */
    function joinPool(uint poolAmountOut, uint[] calldata maxAmountsIn)
        external
        logs
        lock
        needsBPool
        lockUnderlyingPool
    {
        // require(!rights.canWhitelistLPs,
        //         "ERR_NOT_ON_WHITELIST");

        _mintFee();

        // Delegate to library to save space

        // Library computes actualAmountsIn, and does many validations
        // Cannot call the push/pull/min from an external library for
        // any of these pool functions. Since msg.sender can be anybody,
        // they must be internal
        uint[] memory actualAmountsIn = SmartPoolManager.joinPool(
                                            IConfigurableRightsPool(address(this)),
                                            bPool,
                                            poolAmountOut,
                                            maxAmountsIn
                                        );

        // After createPool, token list is maintained in the underlying BPool
        address[] memory poolTokens = bPool.getCurrentTokens();

        for (uint i = 0; i < poolTokens.length; i++) {
            address t = poolTokens[i];
            uint tokenAmountIn = actualAmountsIn[i];

            emit LogJoin(msg.sender, t, tokenAmountIn);

            _pullUnderlying(t, msg.sender, tokenAmountIn);
        }

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
    }

    /**
     * @notice Exit a pool - redeem pool tokens for underlying assets
     * @dev Emits a LogExit event for each token
     *      bPool is a contract interface; function calls on it are external
     * @param poolAmountIn - amount of pool tokens to redeem
     * @param minAmountsOut - minimum amount of asset tokens to receive
     */
    function exitPool(uint poolAmountIn, uint[] calldata minAmountsOut)
        external
        logs
        lock
        needsBPool
        lockUnderlyingPool
    {
        _mintFee();

        // Delegate to library to save space

        // Library computes actualAmountsOut, and does many validations
        // Also computes the exitFee and pAiAfterExitFee
        (uint exitFee,
         uint pAiAfterExitFee,
         uint[] memory actualAmountsOut) = SmartPoolManager.exitPool(
                                               IConfigurableRightsPool(address(this)),
                                               bPool,
                                               poolAmountIn,
                                               minAmountsOut
                                           );

        _pullPoolShare(msg.sender, poolAmountIn);
        _pushPoolShare(exitFeeTo, exitFee);
        _burnPoolShare(pAiAfterExitFee);

        // After createPool, token list is maintained in the underlying BPool
        address[] memory poolTokens = bPool.getCurrentTokens();

        for (uint i = 0; i < poolTokens.length; i++) {
            address t = poolTokens[i];
            uint tokenAmountOut = actualAmountsOut[i];

            emit LogExit(msg.sender, t, tokenAmountOut);

            _pushUnderlying(t, msg.sender, tokenAmountOut);
        }
    }

    /**
     * @notice Join by swapping a fixed amount of an external token in (must be present in the pool)
     *         System calculates the pool token amount
     * @dev emits a LogJoin event
     * @param tokenIn - which token we're transferring in
     * @param tokenAmountIn - amount of deposit
     * @param minPoolAmountOut - minimum of pool tokens to receive
     * @return poolAmountOut - amount of pool tokens minted and transferred
     */
    function joinswapExternAmountIn(
        address tokenIn,
        uint tokenAmountIn,
        uint minPoolAmountOut
    )
        external
        logs
        lock
        needsBPool
        returns (uint poolAmountOut)
    {
        // require(!rights.canWhitelistLPs, 
        //         "ERR_NOT_ON_WHITELIST");

        _mintFee();

        // Delegate to library to save space
        poolAmountOut = SmartPoolManager.joinswapExternAmountIn(
                            IConfigurableRightsPool(address(this)),
                            bPool,
                            tokenIn,
                            tokenAmountIn,
                            minPoolAmountOut
                        );

        emit LogJoin(msg.sender, tokenIn, tokenAmountIn);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        // Update the running fraction of the pool attributable to accumulated fees
        uint fracPoolFeesTrade = bPool.calcFracPoolFeesFromPoolJoin(tokenIn, tokenAmountIn);
        bPool.updateFracPoolFees(fracPoolFeesTrade);

        return poolAmountOut;
    }

    /**
     * @notice Join by swapping an external token in (must be present in the pool)
     *         To receive an exact amount of pool tokens out. System calculates the deposit amount
     * @dev emits a LogJoin event
     * @param tokenIn - which token we're transferring in (system calculates amount required)
     * @param poolAmountOut - amount of pool tokens to be received
     * @param maxAmountIn - Maximum asset tokens that can be pulled to pay for the pool tokens
     * @return tokenAmountIn - amount of asset tokens transferred in to purchase the pool tokens
     */
    function joinswapPoolAmountOut(
        address tokenIn,
        uint poolAmountOut,
        uint maxAmountIn
    )
        external
        logs
        lock
        needsBPool
        returns (uint tokenAmountIn)
    {
        // require(!rights.canWhitelistLPs,
        //         "ERR_NOT_ON_WHITELIST");

        _mintFee();

        // Delegate to library to save space
        tokenAmountIn = SmartPoolManager.joinswapPoolAmountOut(
                            IConfigurableRightsPool(address(this)),
                            bPool,
                            tokenIn,
                            poolAmountOut,
                            maxAmountIn
                        );

        emit LogJoin(msg.sender, tokenIn, tokenAmountIn);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        // Update the running fraction of the pool attributable to accumulated fees
        uint fracPoolFeesTrade = bPool.calcFracPoolFeesFromPoolJoin(tokenIn, tokenAmountIn);
        bPool.updateFracPoolFees(fracPoolFeesTrade);

        return tokenAmountIn;
    }

    /**
     * @notice Exit a pool - redeem a specific number of pool tokens for an underlying asset
     *         Asset must be present in the pool, and will incur an EXIT_FEE (if set to non-zero)
     * @dev Emits a LogExit event for the token
     * @param tokenOut - which token the caller wants to receive
     * @param poolAmountIn - amount of pool tokens to redeem
     * @param minAmountOut - minimum asset tokens to receive
     * @return tokenAmountOut - amount of asset tokens returned
     */
    function exitswapPoolAmountIn(
        address tokenOut,
        uint poolAmountIn,
        uint minAmountOut
    )
        external
        logs
        lock
        needsBPool
        returns (uint tokenAmountOut)
    {
        _mintFee();

        // Delegate to library to save space

        // Calculates final amountOut, and the fee and final amount in
        (uint exitFee,
         uint amountOut) = SmartPoolManager.exitswapPoolAmountIn(
                               IConfigurableRightsPool(address(this)),
                               bPool,
                               tokenOut,
                               poolAmountIn,
                               minAmountOut
                           );

        tokenAmountOut = amountOut;
        uint pAiAfterExitFee = BalancerSafeMath.bsub(poolAmountIn, exitFee);

        emit LogExit(msg.sender, tokenOut, tokenAmountOut);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(pAiAfterExitFee);
        // _pushPoolShare(address(bFactory), exitFee);
        _pushPoolShare(exitFeeTo, exitFee);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        // Update the running fraction of the pool attributable to accumulated fees
        uint fracPoolFeesTrade = bPool.calcFracPoolFeesFromPoolExit(tokenOut, tokenAmountOut);
        bPool.updateFracPoolFees(fracPoolFeesTrade);

        return tokenAmountOut;
    }

    /**
     * @notice Exit a pool - redeem pool tokens for a specific amount of underlying assets
     *         Asset must be present in the pool
     * @dev Emits a LogExit event for the token
     * @param tokenOut - which token the caller wants to receive
     * @param tokenAmountOut - amount of underlying asset tokens to receive
     * @param maxPoolAmountIn - maximum pool tokens to be redeemed
     * @return poolAmountIn - amount of pool tokens redeemed
     */
    function exitswapExternAmountOut(
        address tokenOut,
        uint tokenAmountOut,
        uint maxPoolAmountIn
    )
        external
        logs
        lock
        needsBPool
        returns (uint poolAmountIn)
    {
        _mintFee();

        // Delegate to library to save space

        // Calculates final amounts in, accounting for the exit fee
        (uint exitFee,
         uint amountIn) = SmartPoolManager.exitswapExternAmountOut(
                              IConfigurableRightsPool(address(this)),
                              bPool,
                              tokenOut,
                              tokenAmountOut,
                              maxPoolAmountIn
                          );

        poolAmountIn = amountIn;
        uint pAiAfterExitFee = BalancerSafeMath.bsub(poolAmountIn, exitFee);

        emit LogExit(msg.sender, tokenOut, tokenAmountOut);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(pAiAfterExitFee);
        // _pushPoolShare(address(bFactory), exitFee);
        _pushPoolShare(exitFeeTo, exitFee);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        // Update the running fraction of the pool attributable to accumulated fees
        uint fracPoolFeesTrade = bPool.calcFracPoolFeesFromPoolExit(tokenOut, tokenAmountOut);
        bPool.updateFracPoolFees(fracPoolFeesTrade);
        
        return poolAmountIn;
    }

    /**
     * @notice Get the denormalized weight of a token
     * @dev viewlock to prevent calling if it's being updated
     * @return token weight
     */
    function getDenormalizedWeight(address token)
        external
        view
        viewlock
        needsBPool
        returns (uint)
    {
        return bPool.getDenormalizedWeight(token);
    }

    // /**
    //  * @notice Getter for the RightsManager contract
    //  * @dev Convenience function to get the address of the RightsManager library (so clients can check version)
    //  * @return address of the RightsManager library
    // */
    // function getRightsManagerVersion() external pure returns (address) {
    //     return address(RightsManager);
    // }

    /**
     * @notice Getter for the BalancerSafeMath contract
     * @dev Convenience function to get the address of the BalancerSafeMath library (so clients can check version)
     * @return address of the BalancerSafeMath library
    */
    function getBalancerSafeMathVersion() external pure returns (address) {
        return address(BalancerSafeMath);
    }

    /**
     * @notice Getter for the SmartPoolManager contract
     * @dev Convenience function to get the address of the SmartPoolManager library (so clients can check version)
     * @return address of the SmartPoolManager library
    */
    function getSmartPoolManagerVersion() external pure returns (address) {
        return address(SmartPoolManager);
    }

    // Public functions

    // "Public" versions that can safely be called from SmartPoolManager
    // Allows only the contract itself to call them (not the controller or any external account)

    function mintPoolShareFromLib(uint amount) public {
        require (msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _mint(amount);
    }

    function pushPoolShareFromLib(address to, uint amount) public {
        require (msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _push(to, amount);
    }

    function pullPoolShareFromLib(address from, uint amount) public  {
        require (msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _pull(from, amount);
    }

    function burnPoolShareFromLib(uint amount) public  {
        require (msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _burn(amount);
    }

    // Internal functions

    // Lint wants the function to have a leading underscore too
    /* solhint-disable private-vars-leading-underscore */

    /**
     * @notice Create a new Smart Pool
     * @dev Initialize the swap fee to the value provided in the CRP constructor
     *      Can be changed if the canChangeSwapFee permission is enabled
     * @param initialSupply starting token balance
     */
    function createPoolInternal(uint initialSupply) internal {
        require(address(bPool) == address(0), "ERR_IS_CREATED");
        require(initialSupply >= BalancerConstants.MIN_POOL_SUPPLY, "ERR_INIT_SUPPLY_MIN");
        require(initialSupply <= BalancerConstants.MAX_POOL_SUPPLY, "ERR_INIT_SUPPLY_MAX");


        // There is technically reentrancy here, since we're making external calls and
        // then transferring tokens. However, the external calls are all to the underlying BPool

        // To the extent possible, modify state variables before calling functions
        _mintPoolShare(initialSupply);
        _pushPoolShare(msg.sender, initialSupply);

        // Deploy new BPool (bFactory and bPool are interfaces; all calls are external)
        bPool = bFactory.newBPool();

        for (uint i = 0; i < _initialTokens.length; i++) {
            address t = _initialTokens[i];
            uint bal = _initialBalances[i];
            uint denorm = gradualUpdate.startWeights[i];

            IERC20(t).safeTransferFrom(msg.sender, address(this), bal);
            // bool returnValue = IERC20(t).transferFrom(msg.sender, address(this), bal);
            // require(returnValue, "ERR_ERC20_FALSE");

            // Note: we trust BPool, so the approve() attack is not an issue here
            IERC20(t).safeApprove(address(bPool), BalancerConstants.MAX_UINT);
            // SafeApprove.safeApprove(IERC20(t), address(bPool), BalancerConstants.MAX_UINT);
            // returnValue = IERC20(t).safeApprove(address(bPool), BalancerConstants.MAX_UINT);
            // require(returnValue, "ERR_ERC20_FALSE");

            bPool.bind(t, bal, denorm);
        }

        while (_initialTokens.length > 0) {
            // Modifying state variable after external calls here,
            // but not essential, so not dangerous
            _initialTokens.pop();
        }

        // Set fee to the initial value set in the constructor
        // Hereafter, read the swapFee from the underlying pool, not the local state variable
        bPool.setSwapFee(_initialSwapFee);
        bPool.setPublicSwap(true);

        // "destroy" the temporary swap fee (like _initialTokens above) in case a subclass tries to use it
        _initialSwapFee = 0;
    }

    /* solhint-enable private-vars-leading-underscore */

    // Rebind BPool and pull tokens from address
    // bPool is a contract interface; function calls on it are external
    function _pullUnderlying(address erc20, address from, uint amount) internal needsBPool {
        // Gets current Balance of token i, Bi, and weight of token i, Wi, from BPool.
        uint tokenBalance = bPool.getBalance(erc20);
        uint tokenWeight = bPool.getDenormalizedWeight(erc20);

        IERC20(erc20).safeTransferFrom(from, address(this), amount);
        // bool xfer = IERC20(erc20).transferFrom(from, address(this), amount);
        // require(xfer, "ERR_ERC20_FALSE");
        bPool.rebind(erc20, BalancerSafeMath.badd(tokenBalance, amount), tokenWeight);
    }

    // Rebind BPool and push tokens to address
    // bPool is a contract interface; function calls on it are external
    function _pushUnderlying(address erc20, address to, uint amount) internal needsBPool {
        // Gets current Balance of token i, Bi, and weight of token i, Wi, from BPool.
        uint tokenBalance = bPool.getBalance(erc20);
        uint tokenWeight = bPool.getDenormalizedWeight(erc20);
        bPool.rebind(erc20, BalancerSafeMath.bsub(tokenBalance, amount), tokenWeight);

        IERC20(erc20).safeTransfer(to, amount);
        // bool xfer = IERC20(erc20).transfer(to, amount);
        // require(xfer, "ERR_ERC20_FALSE");
    }


    /*
        Mint shares to pay off accumulated fees not paid to LPs
        Fees MUST be distributed when ANY of the following happen:

        1. the weights change (since formula depends on weights)
        2. someone adds or removes liquidity from the pool (since this changes share supply)
        3. any of the upstream variables change:
            a. bPool._swapFee (maybe not needed, but included to be safe)
            b. fracFeePaidOut
            c. feeTo

        Let 
            G_{t1,t2} = the total accumulated fees between t1 and t2
            s_t = # of LP shares at time t
            sigma_t = # of LP shares issue to owner of fees not paid to LPs at distribution time t
            lambda = fraction of fees not paid to LPs
        
        Then
            s_t2 = s_t1 + sigma_t2
            lambda * G_{t1,t2} = sigma_t2 / s_t2 = sigma_t2 / (s_t1 + sigma_t2)
            sigma_t2 = ( lambda * G_{t1,t2} * s_t1 ) / ( 1 - lambda * G_{t1,t2} )
    */
    function _mintFee()
        internal
    {
        if (feeTo != address(0)) {
            if (fracFeePaidOut != 0) {
                uint fracPoolFees = bPool.getFracPoolFees();
                if (fracPoolFees != 0) {
                    uint pctPoolToPayOut = BalancerSafeMath.bmul(fracFeePaidOut, fracPoolFees); // gas savings
                    uint numerator = BalancerSafeMath.bmul(pctPoolToPayOut, varTotalSupply);
                    uint denominator = BalancerSafeMath.bsub(BalancerConstants.BONE, pctPoolToPayOut);
                    uint newShares = BalancerSafeMath.bdiv(numerator, denominator);
                    
                    if (newShares > 0) {
                        emit LogFeeMint(feeTo, newShares);
                        
                        // convert to payout tokens
                        if (payoutToken != address(0)) {
                            require(bPool.isBound(payoutToken), "ERR_NOT_BOUND");

                            // function calcSingleOutGivenPoolIn(
                            //     uint tokenBalanceOut,
                            //     uint tokenWeightOut,
                            //     uint poolSupply,
                            //     uint totalWeight,
                            //     uint poolAmountIn,
                            //     uint swapFee,
                            //     uint exitFee
                            // )
                            uint tokenAmountOut = bPool.calcSingleOutGivenPoolIn(
                                                bPool.getBalance(payoutToken),
                                                bPool.getDenormalizedWeight(payoutToken),
                                                this.totalSupply(),
                                                bPool.getTotalDenormalizedWeight(),
                                                newShares,
                                                0,      // Swap fee is 0 for fee payouts
                                                0       // Exit fee set to 0
                                            );
                            _pushUnderlying(payoutToken, feeTo, tokenAmountOut);
                        }
                        // If payoutToken not set, don't convert, just issue shares
                        // *** Make sure that feeTo can accept shares **
                        else {
                            _mintPoolShare(newShares);
                            _pushPoolShare(feeTo, newShares);
                        }
                    }
                }
            }
        }
        // Reset the fraction of pool attributable to fees
        // Do this every time to prevent weird overflow
        bPool.resetFracPoolFees();
    }

    /*
        Manually trigger _mintFee
    */
    function mintFee()
        external
        lock
    {
        _mintFee();
    }

    /**
     * @notice Set the the address that receives the fee not given to the LPs
     */
    function setFeeTo(address t)
        external
        logs
        lock
        onlyOwner
    {
        _mintFee();
        feeTo = t;
    }

    /**
     * @notice Set the the address that receives exit fees
     */
    function setExitFeeTo(address t)
        external
        logs
        lock
        onlyOwner
    {
        exitFeeTo = t;
    }


    /**
     * @notice Set the the address that receives the fee not given to the LPs
     */
    function setFracFeePaidOut(uint frac)
        external
        logs
        lock
        onlyOwner
    {
        _mintFee();
        fracFeePaidOut = frac;
    }

    /**
     * @notice Set the token that the paid out fee is converted to before payout
     * @dev Set to address(0) if we want to payout pool shares instead
     */
    function setPayoutToken(address erc20)
        external
        logs
        lock
        onlyOwner
        needsBPool
    {
        if (erc20 != address(0)) {
            require(bPool.isBound(erc20), "ERR_NOT_BOUND");
        }
        payoutToken = erc20;
    }


    // Wrappers around corresponding core functions
    function _mint(uint amount) internal override {
        super._mint(amount);
    }

    function _mintPoolShare(uint amount) internal {
        _mint(amount);
    }

    function _pushPoolShare(address to, uint amount) internal {
        _push(to, amount);
    }

    function _pullPoolShare(address from, uint amount) internal  {
        _pull(from, amount);
    }

    function _burnPoolShare(uint amount) internal  {
        _burn(amount);
    }

}
