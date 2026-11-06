# Reproducible dependency pins

Requires a POSIX shell, curl, tar, Python 3 and standard file utilities. Run `npm run deps` (or `sh script/install-deps.sh`) before building. The installer fetches commit-specific GitHub codeload tarballs without git, keeps only source needed by builds and upstream licenses, and writes a commit marker for idempotent repeat runs. `lib/` is generated and ignored; no vendored snapshot belongs in this package. Removing `lib/` and rerunning restores the same pinned sources. The existing remappings remain unchanged.

| Directory | Repository | Commit | Use |
| --- | --- | --- | --- |
| lib/v4-core | Uniswap/v4-core | bea7f6d1c11cd5dc4f0d5151ffa37a1c239feee6 | PoolManager, canonical hook ABI, tick and delta math |
| lib/v4-core/lib/forge-std | foundry-rs/forge-std | 1de6eecf821de7fe2c908cc48d3ab3dced20717f | Test support source |
| lib/v4-core/lib/solmate | transmissions11/solmate | 4b47a19038b798b4a33d9749d25e570443520647 | v4 transitive source dependency |
| lib/solady | Vectorized/solady | 258f67cc71e39cff307b726939ade17e9d8bcf5c | FixedPointMathLib, optional ERC-20 base |
| lib/permit2 | Uniswap/permit2 | cc56ad0f3439c502c246fc5cfcc3db92bb8b7219 | AllowanceTransfer interfaces |

Optional OpenZeppelin sources are not needed by the application import graph. No application source imports it. v4-periphery is unnecessary: the routers expose the exact `msgSender() external view returns (address)` ABI and the hook inherits canonical core `IHooks` directly. There is no copied or modified BaseHook.

Permit2's implementation pins Solidity 0.8.17 upstream. Import its compatible interfaces into the 0.8.26 application, not the implementation. Arc uses its already deployed canonical Permit2. A local Permit2 deployment or pinned runtime fixture belongs to the subsequent integration package and must be prepared with its upstream compiler. This package's unit tests do not require Permit2 runtime.

Build with Solidity 0.8.26, Cancun, via IR and 200 optimizer runs. The compiler is already installed in the working environment. Run `sh script/install-deps.sh`, `forge build` and `forge test` from this directory; no RPC or environment secrets are needed.

Only `src/` is retained for v4-core, forge-std, solmate and solady; only `src/interfaces/` is retained for Permit2. Upstream tests, examples, package tooling and recursive submodules are omitted. The nested forge-std and solmate dependencies are fetched explicitly at the pins above. Permit2 AllowanceTransfer requires takers to approve USDC to Permit2 and grant router allowances beforehand; it is never used to pull maker NightToken.
