// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/ShieldedPool.sol";
import "../src/NullifierRegistry.sol";
import "../src/IncrementalMerkleTree.sol";
import "../src/verifiers/TransferVerifier.sol";
import "../src/verifiers/WithdrawVerifier.sol";
import "../src/verifiers/DepositVerifier.sol";
import "../src/verifiers/MpcSettlementVerifier.sol";
import "../src/verifiers/MpcPricedSettlementVerifier.sol";

/**
 * @title Deploy
 * @notice Deploys and wires the full Shade shielded-pool system on Arc:
 *         Poseidon2 (from circomlibjs bytecode), NullifierRegistry, all five
 *         Groth16 verifiers, and ShieldedPool — mirroring what
 *         scripts/deploy-shielded-pool.ts + scripts/deploy-mpc-verifier.ts do
 *         together on the Stellar side, in one broadcast.
 *
 * Requires `npm run circuits:build:arc && npm run arc:sync-verifiers` to have
 * run first, so contracts/arc/src/verifiers/*.sol exist and compile.
 *
 * Env:
 *   PRIVATE_KEY   deployer key (also becomes the contract admin)
 *   POOL_ID       domain separator (default 1)
 *   CHAIN_ID      domain separator (default block.chainid)
 *   TREE_DEPTH    merkle depth (default 12)
 *
 * After this script, an operator must still call (not automated here, since
 * these are deployment-specific / operational decisions, not fixed wiring):
 *   pool.registerAsset(usdcAssetId, usdcTokenAddress)
 *   pool.setAssociationRoot(initialAssociationRoot)
 *   pool.setCommittee(committeePubkeys)      -- only if MPC settlement is used
 *   pool.setEd25519Verifier(ed25519VerifierAddress)  -- only if MPC/RFQ is used
 *   pool.setAuthorizedSolver(solverPubkey, true)     -- only if RFQ is used
 *   pool.setCctpConfig(tokenMessenger, usdc, outboundDomain) -- only if CCTP exit is used
 */
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);
        uint256 poolId = vm.envOr("POOL_ID", uint256(1));
        uint256 chainId = vm.envOr("CHAIN_ID", uint256(block.chainid));
        uint32 depth = uint32(vm.envOr("TREE_DEPTH", uint256(12)));

        vm.startBroadcast(pk);

        // 1. Poseidon2, from the raw circomlibjs-generated creation bytecode
        // (kept in test/ since it's shared with the Foundry test suite).
        bytes memory poseidonCode = vm.parseBytes(vm.readFile("test/poseidon2.bin"));
        address poseidonAddr;
        assembly {
            poseidonAddr := create(0, add(poseidonCode, 0x20), mload(poseidonCode))
        }
        require(poseidonAddr != address(0), "poseidon deploy failed");

        // 2. nullifier registry
        NullifierRegistry nullReg = new NullifierRegistry(admin);

        // 3. all five Groth16 verifiers
        TransferVerifier transferVerifier = new TransferVerifier();
        WithdrawVerifier withdrawVerifier = new WithdrawVerifier();
        DepositVerifier depositVerifier = new DepositVerifier();
        MpcSettlementVerifier mpcVerifier = new MpcSettlementVerifier();
        MpcPricedSettlementVerifier mpcPricedVerifier = new MpcPricedSettlementVerifier();

        // 4. the pool itself
        ShieldedPool pool = new ShieldedPool(
            admin,
            address(nullReg),
            poolId,
            chainId,
            depth,
            IPoseidon2(poseidonAddr)
        );

        // 5. wire nullifier authorization + all verifiers
        nullReg.setAuthorizedSpender(address(pool), true);
        pool.setTransferVerifier(address(transferVerifier));
        pool.setWithdrawVerifier(address(withdrawVerifier));
        pool.setDepositVerifier(address(depositVerifier));
        pool.setMpcVerifier(address(mpcVerifier));
        pool.setMpcPricedVerifier(address(mpcPricedVerifier));

        vm.stopBroadcast();

        console.log("Poseidon2:                  ", poseidonAddr);
        console.log("NullifierRegistry:          ", address(nullReg));
        console.log("TransferVerifier:           ", address(transferVerifier));
        console.log("WithdrawVerifier:           ", address(withdrawVerifier));
        console.log("DepositVerifier:            ", address(depositVerifier));
        console.log("MpcSettlementVerifier:      ", address(mpcVerifier));
        console.log("MpcPricedSettlementVerifier:", address(mpcPricedVerifier));
        console.log("ShieldedPool:               ", address(pool));
        console.log("");
        console.log("Still needed (operational, not automated here):");
        console.log("  pool.registerAsset(assetId, token)");
        console.log("  pool.setAssociationRoot(root)");
        console.log("  pool.setCommittee(pubkeys)        -- if MPC settlement is used");
        console.log("  pool.setEd25519Verifier(addr)     -- if MPC/RFQ is used");
        console.log("  pool.setAuthorizedSolver(pk, true)-- if RFQ is used");
        console.log("  pool.setCctpConfig(tm, usdc, dom) -- if CCTP exit is used");
    }
}
