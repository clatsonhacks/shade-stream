# CCTP on Stellar (V2)

> Testnet only; no mainnet claim. CCTP inherits Circle attester trust. Spec:
> `shade_testnet_e2e_agent_build_spec.md` §8.

Uses **Circle CCTP V2 only** (`depositForBurnWithHook`, confirmed/finalized
finality thresholds). Source chain: Arbitrum Sepolia (domain 3). Destination:
Stellar (domain 27).

## Footguns and how they are blocked (§8.3/§8.4)

| Footgun | Guard |
| --- | --- |
| 32-byte address payload G/M/C confusion | `stellarContractToBytes32` / `validateInboundRoute` require `StrKey.isValidContract` — a G account is rejected. |
| `mintRecipient` must be the CctpForwarder | `validateInboundRoute` (and the burn builder sets it). |
| `destinationCaller` must be the CctpForwarder | `validateInboundRoute`. |
| Malformed `forwardRecipient` | must be a C contract (`encodeStellarForwardHook`). |
| Wrong destination domain | `validateInboundRoute` requires domain 27. |
| 6→7 decimal scaling | `usdc6ToStellar7` = ×10; `stellar7ToUsdc6` rejects 7th-decimal dust. |
| Duplicate nonce | `receive_cctp_deposit` rejects a repeated CCTP nonce (`DuplicateDeposit`) — no second note. |
| Unsupported outbound domain | `withdraw_cctp` rejects any destination domain ≠ Arbitrum Sepolia (`UnsupportedDomain`) before burning. |
| Attestation delay/timeout | `pollAttestation` throws on timeout → the relayer job is retryable/recoverable. |

## Inbound (source USDC → private USDC note)

`depositForBurnWithHook` on Arbitrum with `mintRecipient = destinationCaller =
CctpForwarder` and a forward hook to the pool → Circle attestation → Stellar
forwarder → `receive_cctp_deposit` verifies the DepositNoteMint proof (binding
the CCTP message to the note commitment, incl. `assetIdHash`), registers the
note, and credits per-asset supply. `amount7 = amount6 × 10`.

## Outbound (private USDC note → CCTP exit)

`withdraw_cctp` binds `destinationDomain`, `destinationRecipient`, `maxFee`, and
`minFinalityThreshold` to the user's proof (a relayer cannot mutate them), gates
unsupported domains, spends the nullifier, and burns pool USDC via the Stellar
TokenMessengerMinter.

## Tests

- `cctp-footguns:test` (`@shade/cctp-utils`): route + G/M/C + scaling/dust guards.
- `relayer-user-burn:test`: inbound burn validation (amount/domain/mintRecipient/
  burnToken/destinationCaller/maxFee/finality/hookData).
- Contract (`shielded_pool/src/tests.rs`): duplicate nonce → no second note;
  `withdraw_cctp` rejects unsupported domain, recipient/fee mutation, wrong
  finality.
- Inbound/outbound testnet E2E → Phase 8 acceptance suite.
