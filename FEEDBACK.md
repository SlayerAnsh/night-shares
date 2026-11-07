# Uniswap developer feedback

Night Shares turns hotel room nights into ERC-20 NightTokens. Each night trades in its own Uniswap v4 pool against USDC on Arc (chain 5042 mainnet, 5042002 testnet). The host's price curve is a ladder of concentrated liquidity positions that NightVault seeds when the night opens. A single hook (NightHook) enforces policy: a 30% per human holding cap, a 1.3% fee split between host, treasury and a cover fund, a pause switch and a trading cutoff. TradeRouter and BookingRouter drive swaps through `PoolManager.unlock` and `unlockCallback`, and take USDC through Permit2 AllowanceTransfer.

Uniswap pieces used:

- `v4-core` PoolManager, pinned at `bea7f6d1` (`packages/contracts/DEPENDENCIES.md`). No v4-periphery and no BaseHook copy. The hook implements core `IHooks` directly and the routers expose `msgSender()`.
- Hooks with `beforeSwapReturnDelta` and `afterSwapReturnDelta` (`packages/contracts/src/NightHook.sol`).
- Canonical Permit2 at `0x000000000022D473030F116dDEE9F6B43aC78BA3`.
- The official v4 PoolManager on Arc at `0x8366a39CC670B4001A1121B8F6A443A643e40951` (`packages/contracts/deployments/5042.json`, `5042002.json`).

## What worked well

- **Singleton and flash accounting.** One unlock per ladder chunk lets NightVault add up to ten positions in a single callback (`NightVault.sol`, `Factory.addLadderChunk` in `CONTRACTS.md`). Settlement redeems the reserve and removes all remaining positions at cutoff in one transaction. Batching many position changes behind one unlock kept these flows simple.
- **Hooks as a policy layer.** We let the pool do all the pricing and used the hook only for rules and fees. That split held up through the whole build. `beforeInitialize` pins the pool key (`fee == 0`, `tickSpacing == 1`, USDC as currency1, the hook itself). `beforeAddLiquidity` and `beforeRemoveLiquidity` restrict liquidity to vault owned positions. `beforeDonate` reverts. Nobody can bypass the rules by adding liquidity or donating.
- **Return deltas for fees.** Taking the fee in USDC through a hook delta means users always pay and receive in USDC, whichever side is exact. No separate fee transfer is needed.
- **Integer accounting you can audit.** Our end to end suite sums USDC across every account, including PoolManager, after each step and finds zero micro USDC discrepancy (`CONTRACTS.md`, FullFlow notes). PoolManager rounding dust is real but bounded and visible.
- **Permit2.** Users approve once to Permit2 and then grant each router an allowance. A finite allowance regression proves that only the final payment is consumed (`CONTRACTS.md`, fix 3).
- **Deterministic deployment.** Because v4 and Permit2 sit at the same addresses across Arc networks, one deploy library (`script/DeployLib.sol`) serves the fork, testnet and mainnet unchanged.

## Friction and bugs we hit

### 1. No documented v4 deployment on Arc testnet

- **What happened.** The v4 deployments page lists Arc mainnet but not Arc testnet. Our first testnet deploy shipped its own v4-core PoolManager (`deployments/5042002-v1.json`, `POOL_MANAGER` `0x09586E64...7C69`; commit `5dc2765`). We later found that the official PoolManager also exists on testnet at the mainnet address, with byte identical runtime code. We only learned this by comparing deployed code, and redeployed against it (`deployments/5042002.json`, commit `5801bf6`).
- **Impact.** One full redeploy. Every consumer had to read `POOL_MANAGER` from a per network file instead of trusting a single address, and our testnet rehearsal ran against a pool manager nobody else uses.
- **Suggestion.** List testnet deployments next to mainnet for each chain, including Arc testnet. If an address is the same on both, say so.

### 2. Hook address mining and the CREATE2 sender

- **What happened.** The hook needs permission bits `0x2aec` in its address, so `DeployLib.sol` brute forces a CREATE2 salt. In a Foundry broadcast, the CREATE2 sender is not the same as in a test, so we added a one shot `HookDeployer` that runs the CREATE2 in its own constructor at a predicted nonce. That gives one known sender in both tests and broadcasts. The hook also cannot know its own final address in its constructor arguments (`CONTRACTS.md`, deployment section).
- **Impact.** Extra deployment plumbing (address prediction for every peer, a helper contract, and checks of each predicted address after deploy) before the first pool could exist.
- **Suggestion.** Ship an official, documented CREATE2 deployer pattern for hooks that works the same in `forge test` and `forge script --broadcast`, and warn about the sender difference in the hook deployment guide.

### 3. Currency ordering against USDC

- **What happened.** We need the NightToken to be `currency0` so the hook and ladder math have one orientation. Arc USDC lives at `0x3600...0000`, a low address, so every NightToken is deployed with CREATE2 and a host supplied salt that sorts it below USDC (`NightFactory.sol`, `NightTokenDeployer.sol`). The hook rejects any pool whose `currency0` is not below USDC.
- **Impact.** A second salt mining step on every night opening, and token prediction logic in the factory.
- **Suggestion.** Docs on currency ordering could say plainly that a protocol issuing many tokens against one quote asset will want to fix the orientation, and show a salt mining helper for it.

### 4. Taking a fee in `beforeSwap` before the pool holds the currency

- **What happened.** When USDC is the exact side, NightHook computes the fee in `beforeSwap` and calls `manager.take` for it. On the first buy in a fresh pool, PoolManager held no USDC yet, so the take failed (`CONTRACTS.md`, fix 3). We now pre-settle the router's available USDC before the swap in quotes, and the exact quoted payment in execution (`TradeRouter.sol`, `_swapFunded`).
- **Impact.** The first buy on a new night could not pay its fee until fixed, and both routers needed extra pre-settle logic.
- **Suggestion.** The return delta docs should state that `take` draws on PoolManager's real balances, not only on the current delta, and show the pattern for a hook that pays out fees mid swap.

### 5. Exact output fees and rounding

- **What happened.** For exact USDC swaps the hook must invert the fee so that the specified amount includes it exactly. Integer rounding means the first inversion can be off by one, so `beforeSwap` bumps `gross` and recomputes (`NightHook.sol`, around the "Invert the rounded fee" comment). It also stores the fee and checks it again in `afterSwap`, using a `swapHash` to tie the two callbacks together.
- **Impact.** The most subtle code in the hook. It needed dedicated tests.
- **Suggestion.** A reference hook that charges a percentage fee in the quote currency on both exact input and exact output, with rounding tests, would save every fee hook author this work.

### 6. Ladder rounding and liquidity residue

- **What happened.** Ladder positions round liquidity up, and integer swap rounding can leave a small token remainder that no swap can consume. In one regression a swept sellout and sellback left 824 token wei unconsumable at cutoff (`CONTRACTS.md`, item 10 and fix 5). Position removal also leaves micro USDC dust inside PoolManager.
- **Impact.** We had to add a bounded residue rule to Settlement and a per room buffer at minting.
- **Suggestion.** Document the worst case rounding residue for a position over its lifetime, so protocols that must account for every unit can size their buffers ahead of time.

### 7. Tick snapping versus a continuous price model

- **What happened.** Our off chain market model priced the curve continuously. Pool boundaries are `floor(log base 1.0001)` of the raw price, so on chain costs differ from the model (for example `cost(6,7)` is 10091.428508 USDC at F=6000, k=1.2, S=15, per `CONTRACTS.md`). We changed the model to snap boundaries down to the tick grid with the raw USDC to NightToken decimal ratio (`CHANGELOG.md`, market model sync to `53a8f129bd65`).
- **Suggestion.** A short worked example of converting a human price with differing token decimals (6 and 18) into ticks would have caught this earlier.

### 8. EIP-170 size pressure

- **What happened.** The factory embedded NightToken creation code and reached 23,819 of 24,576 runtime bytes (757 bytes of headroom). We moved token creation into `NightTokenDeployer` (commit `96d52ae`). The factory is now 8,875 bytes (`evidence/x402-offline-sizes.txt`), guarded by `test_factoryRuntimeHasHeadroom`. Opening math also moved into the vault for the same reason (`CONTRACTS.md`, opening math note).
- **Impact.** This is not caused by Uniswap. But v4 integrations pull in a lot of core libraries (TickMath, FullMath, StateLibrary), and it adds up quickly.
- **Suggestion.** Note typical bytecode costs of the core libraries in the hook guide.

## Docs and tooling requests

- **Quoting with hooks that take deltas.** We quote by having the router call itself, run the real swap and revert with the result (`TradeRouter.quotePool`, `QuoteResult`). This is the same pattern the v4 Quoter uses. A documented, hook aware quoting recipe, including how hook fee deltas show up, would help.
- **Reading pool state without StateView.** Our API reads slot0 and position liquidity through `extsload`, with storage slot offsets typed in by hand (`apps/api/src/modules/market/chain/pool.ts`, `readPoolAt`). A published storage layout guarantee, or a StateView address listed per chain, would make this less fragile.
- **Permit2 in tests.** Permit2 pins Solidity 0.8.17, so we could not build it alongside our 0.8.26 contracts. We captured the deployed runtime from Arc testnet and etch it in tests, after checking its hash (`test/fixtures/README.md`). An officially published Permit2 runtime artifact with its hash would be cleaner.
- **Hook permission bits.** A table mapping each flag to its bit, plus a CLI that prints the required mask for a `Hooks.Permissions` struct, would remove guesswork when mining.

## Arc specific notes

- Arc's native USDC is both the gas token and an ERC-20 at `0x3600...0000`. It uses a blocklist precompile that Foundry and Anvil cannot simulate. Our local fork etches a mock USDC at that address (`CONTRACTS.md`, e2e notes). On live networks the API cannot use storage overrides to simulate quotes. Instead it projects the deployed ladder positions off chain, and the router's on chain limits stay authoritative (`apps/api/src/modules/market/chain/quote-simulation.ts`, `DEVELOPER.md` chain mode section). This is Arc behaviour, not Uniswap's. But it means simulation based quoting (Quoter, `eth_call` with overrides) does not work on Arc yet. Any Uniswap guidance for chains like this would be welcome.
- Native USDC uses 18 decimals for gas, while the ERC-20 interface uses 6 (`DEVELOPER.md`). Pool math only sees the 6 decimal side, but tooling that mixes the two can go wrong.
- Once we had the right addresses, deploying against the official PoolManager and Permit2 on both Arc networks went smoothly. Mainnet verification confirmed hook flags `0x2aec` and immutable wiring (commit `dc30c82`).
