// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @dev Ed25519 signature verifier interface.
 *
 * Stellar verified committee ed25519 signatures via `env.crypto().ed25519_verify`
 * (a host function). EVM has no ed25519 precompile, so the raw check is delegated
 * to a pluggable verifier contract. A Solidity ed25519 implementation (e.g.
 * chatch/ed25519-solidity, vendored under lib/) is injected at deploy time.
 *
 * The THRESHOLD semantics (>= ceil(2n/3) distinct, registered signers) are
 * enforced here in `CommitteeRegistry`, identical to the Soroban original.
 */
interface IEd25519Verifier {
    /// @return true iff `signature` is a valid ed25519 signature of `message` by `pubKey`.
    function verify(bytes32 pubKey, bytes memory message, bytes memory signature)
        external
        view
        returns (bool);
}

/**
 * @title CommitteeRegistry
 * @notice Port of the MPC committee-threshold logic from
 *         `contracts/stellar/shielded_pool` (`set_committee`, `get_committee`,
 *         `verify_committee_threshold`).
 *
 * Requires >= ceil(2n/3) DISTINCT, registered committee ed25519 signatures over
 * a batch hash. Duplicate or unregistered signers, or too few valid signatures,
 * cause a revert — matching the Soroban behavior exactly.
 */
library CommitteeLib {
    error CommitteeNotInitialized();
    error MpcThreshold();
    error MpcUnknownSigner();
    error MpcDuplicateSigner();
    error MpcSignatureInvalid();

    /**
     * @notice Verify the committee threshold over `batchHash`.
     * @param committee the registered committee pubkeys
     * @param ed25519 the injected ed25519 verifier
     * @param batchHash the 32-byte message all signers signed
     * @param signerPubkeys the pubkeys that signed (must be distinct & registered)
     * @param signatures parallel array of 64-byte ed25519 signatures
     */
    function verifyThreshold(
        bytes32[] memory committee,
        IEd25519Verifier ed25519,
        bytes32 batchHash,
        bytes32[] calldata signerPubkeys,
        bytes[] calldata signatures
    ) internal view {
        uint256 n = committee.length;
        if (n == 0) revert CommitteeNotInitialized();

        // ceil(2n/3) — identical to Soroban `(n*2 + 2) / 3`
        uint256 threshold = (n * 2 + 2) / 3;
        if (signerPubkeys.length < threshold || signatures.length < threshold) {
            revert MpcThreshold();
        }

        bytes memory msgBytes = abi.encodePacked(batchHash);
        bytes32[] memory seen = new bytes32[](signerPubkeys.length);
        uint256 seenCount = 0;
        uint256 verified = 0;

        for (uint256 i = 0; i < signerPubkeys.length; i++) {
            bytes32 pk = signerPubkeys[i];

            // must be a registered committee member
            bool registered = false;
            for (uint256 j = 0; j < n; j++) {
                if (committee[j] == pk) {
                    registered = true;
                    break;
                }
            }
            if (!registered) revert MpcUnknownSigner();

            // must not be a duplicate within this call
            for (uint256 j = 0; j < seenCount; j++) {
                if (seen[j] == pk) revert MpcDuplicateSigner();
            }
            seen[seenCount++] = pk;

            // raw ed25519 signature check (delegated)
            if (!ed25519.verify(pk, msgBytes, signatures[i])) {
                revert MpcSignatureInvalid();
            }
            verified++;
        }

        if (verified < threshold) revert MpcThreshold();
    }
}
