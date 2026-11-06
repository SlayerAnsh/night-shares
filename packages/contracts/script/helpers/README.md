# Local USDC fixture

Use chain ID 5042002. Deploy your own v4-core PoolManager for local and Arc testnet integration. USDC is configured as `0x3600000000000000000000000000000000000000`; Permit2 is configured as `0x000000000022D473030F116dDEE9F6B43aC78BA3`. These are deployment inputs, not application contract constants.

In a Forge test:

```solidity
MockUSDC implementation = new MockUSDC();
vm.etch(0x3600000000000000000000000000000000000000, address(implementation).code);
MockUSDC(0x3600000000000000000000000000000000000000).mint(user, 100_000e6);
```

For a local Anvil instance, first build, then replace runtime code:

```sh
forge build
MOCK_RUNTIME=$(forge inspect test/mocks/MockUSDC.sol:MockUSDC deployedBytecode)
cast rpc --rpc-url http://127.0.0.1:8545 anvil_setCode 0x3600000000000000000000000000000000000000 "$MOCK_RUNTIME"
```

Call unrestricted `mint(address,uint256)` using a funded local account to create balances. Etching does not execute a constructor or clear previous storage. Use a fresh plain Anvil chain for deterministic tests; replacing code on an existing fork preserves that address's existing storage. This mock keeps the spike's storage order: totalSupply, balanceOf, allowance. Metadata uses constants, so it works without initialization. The fixture adds standard ERC-20 events to the spike's minimal transfer behavior.

Do not use ERC-20 deal or native balance funding to simulate the real Arc USDC transfer path. Anvil lacks Arc's native USDC system execution. This fixture uses ordinary storage and does not model the coupling between native balances and ERC-20 balances. Real testnet settlement remains a later integration check.
