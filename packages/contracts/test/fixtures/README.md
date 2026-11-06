# Permit2 runtime fixture

`Permit2.hex` contains the 9,152-byte runtime captured by the earlier local fork spike from canonical Permit2 at `0x000000000022D473030F116dDEE9F6B43aC78BA3` on Arc testnet, chain ID 5042002, block 71096686. The source evidence was `scratchpad/fork-spike/evidence/Permit2.hex` with the adjacent `pin.json`. The spike exercised a signed Permit2 transfer on both the hybrid fork and plain Anvil.

The runtime keccak256 is `0x53681d3cf8f702f849c1504b491049c3d0a282e4595d9b297c410dcf36f0908e`. `FullFlow.t.sol` checks this hash before etching it at the canonical address. No network access or compiler download is required. This is deployed Permit2 bytecode, not a replacement implementation or test double. The tests use its real AllowanceTransfer approval and transfer paths.

The vendored `lib/permit2` contains interfaces only. Permit2 source pins Solidity 0.8.17, while the application pins 0.8.26. Keeping the captured runtime fixture separate avoids changing either pragma or compiling a counterfeit Permit2 against the application's compiler. This package does not claim a reproducible source build of the captured bytecode. Replacing the fixture requires documenting its provenance and updating the asserted hash intentionally.
