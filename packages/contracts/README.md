# Night Shares contracts

These contracts are unaudited. The attester is a trusted operator for wallet identity, property binding and walk reports. Do not treat the fork run as a security audit or as validation of Arc native USDC execution.

## Unit and integration tests

Use Foundry with Solidity 0.8.26 and Cancun support. Docker uses Foundry v1.7.1.

```sh
cd packages/contracts
sh script/install-deps.sh
forge test --offline
```

The first build needs the Solidity compiler available locally. Dependencies are downloaded from pinned archives without git. Existing large-price numerical regression tests explicitly use larger constructor limits. Production deployment defaults are 1 USDC for F, 50 USDC for full ladder cost, 100 rooms and 20 unsettled nights.

## Local Arc mainnet fork

Run from `app`. Docker must be running and port 8545 must be available. The default upstream block is 29914738 on Arc mainnet, chain ID 5042. Both compose modes work:

```sh
BUILDX_CONFIG="$PWD/packages/contracts/.cache/buildx" docker compose -f docker-compose.chain.yml build
docker compose -f docker-compose.yml -f docker-compose.chain.yml up -d chain contracts-deploy
# Alternatively, run the separate file alone:
# docker compose -f docker-compose.chain.yml up -d
docker compose -f docker-compose.chain.yml logs -f contracts-deploy
docker compose -f docker-compose.chain.yml ps -a
```

Wait for `chain` to be healthy and `contracts-deploy` to exit with code 0. The output is `packages/contracts/deployments/5042-fork.json`. It contains addresses, confirmed final block, simulation block, transaction hashes, configuration, limits, EIP-712 domain and contract ABIs. Seeding adds the demo NightToken, night ID and full ladder cost. The demo is `demo:double:2030-01-01`, F 0.5 USDC, k 1.2 and S 10. Anvil accounts 1 through 5 receive 1,000 mock USDC each and Orb links. Account 1 is the host; account 9 is the attester; account 0 deploys and owns pause controls. These are public test keys.

The one-shot container only broadcasts to `http://chain:8545` and probes `anvil_nodeInfo` before mutations. It clears existing delegated-account code on the ten public Anvil fixture addresses so they behave as EOAs. It funds native balances using `anvil_setBalance` and replaces USDC runtime at `0x3600000000000000000000000000000000000000`. PoolManager and Permit2 retain their forked mainnet code. Mock USDC has unrestricted minting and does not share Arc native balances. No PoolManager is deployed by either deployment script.

```sh
cd packages/contracts
FORK_RPC=http://127.0.0.1:8545 forge test --offline --match-contract ForkFlowTest -vv
cd ../..
docker compose -f docker-compose.chain.yml down
```

Without `FORK_RPC`, the live fork test is skipped. With it, Forge executes against deployed addresses and discards its test mutations. The test covers property binding, identity linking, opening, buys, signed asks, sellback, full sellout, recall booking, sweep, walk refund, paused cutoff, batching and claim fallback.

`down` preserves the named `arc-fork-state` volume. It contains Anvil state and the fork cache. Restarting reuses it; rerunning the deploy service deploys a new system and replaces the JSON. To deliberately discard this project's fork state, use `docker compose -f docker-compose.chain.yml down -v`. Set `ARC_FORK_RPC` and `ARC_FORK_BLOCK` together when selecting another upstream snapshot, and use a fresh state volume. Public RPC throttling is configured at 20 compute units per second with a 2,000 ms retry backoff.

## Later mainnet deployment

Mainnet deployment was not broadcast by this work. Prepare and review configuration and simulation first. Provision the `night-shares-deployer` Foundry keystore separately; these scripts neither create nor modify keystores. Set the following variables to reviewed values:

```sh
export CHAIN_ID=5042
export DEPLOYMENT_NAME=5042-mainnet
export POOL_MANAGER=0x8366a39CC670B4001A1121B8F6A443A643e40951
export USDC=0x3600000000000000000000000000000000000000
export PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3
# Set ATTESTER, PLATFORM and OWNER to reviewed production addresses.
export MAX_F=1000000 MAX_POOL=50000000 MAX_S=100 MAX_OPEN_NIGHTS=20
mkdir -p deployments
forge script script/Deploy.s.sol:Deploy --rpc-url https://rpc.mainnet.arc.io --account night-shares-deployer
```

On chain ID 5042, the script requires `MAX_F=1000000`, `MAX_POOL=50000000`, `MAX_S=100` and `MAX_OPEN_NIGHTS=20` unless `ALLOW_CUSTOM_LIMITS=true`. OWNER, ATTESTER and PLATFORM must be distinct from each other and from the broadcasting deployer. The limits override does not bypass role separation. These guards run before broadcasting.

The command above only simulates. A later authorized deployment adds `--broadcast --slow`. Never run `Seed.s.sol` or the fork shell wrapper against a production network. `MAX_S` is expressed in rooms in the environment and converted to 18-decimal token units in the constructor. Other monetary limits use micro USDC. The supplied PoolManager, USDC and Permit2 must already contain code, and `CHAIN_ID` must match the connected chain. The script has no path that deploys a PoolManager.

The JSON is generated during simulation, so it is not proof of successful broadcast. Check receipts and deployed code after broadcasting before publishing addresses. Preserve the broadcast artifacts alongside the JSON.

## Recorded fork verification

The run on November 7, 2026 used block **29914738**, hash `0x913074560e335af7716461f3fb3497f0fc9eb1b0bc427c0fe10e8653eb6f7520`. The default safety limits passed all boundary and counter tests. The offline suite passed **121 tests**, with the environment-gated fork test skipped. The live fork suite then passed **1 test**, covering the complete flow described above. See [unit output](unit-results.txt) and [fork flow output](evidence/fork-flow.txt).

Compose reached a healthy chain and deploy exit code 0. The manifest is [deployments/5042-fork.json](deployments/5042-fork.json), with TradeRouter `0x2aA12f98795E7A65072950AfbA9d1E023D398241`. The demo ladder cost is **9,660,865 micro USDC**. All 28 deployment and seed receipts succeeded. All 11 emitted addresses, including the helper and seeded token, have runtime code below EIP-170. The factory runtime is 22,362 bytes. Public receipt summaries and runtime sizes are in [verified-deployment.json](evidence/verified-deployment.json).

The mainnet PoolManager runtime is 24,009 bytes and differs from the pinned v4-core build. Compatibility is established for the paths exercised: initialize, unlock, modifyLiquidity, swap, sync, settle, take, hook callbacks and StateLibrary storage reads. Permit2 approval and transferFrom executed against its existing 9,152-byte mainnet runtime. The selector inventory is supplementary evidence, not a proof that every unused ABI entry or future upgrade behaves identically. See [inventory.json](evidence/inventory.json).

The bootstrap additionally clears delegated code on public Anvil test accounts because the upstream attester fixture address had existing delegation and was being treated as an ERC-1271 contract. This change is confined to fixture accounts on the local fork. Only the USDC dependency is mocked. The live test's timestamp jump also uses an explicit check-in-based attestation deadline to avoid compiler assumptions that block.timestamp cannot change within one transaction.

Both compose configurations validated. The chain and deploy containers were removed with `docker compose down`; the `app_arc-fork-state` volume remains. See [compose status](evidence/compose-status.json), [successful deployment output](evidence/deploy-final.txt) and [teardown output](evidence/teardown.txt). No real network transaction was broadcast, and no Foundry keystore was accessed.

## X402 offline implementation

NightToken supports EIP-3009 under its own NightShares Room Night version 1 domain. X402Settler combines authorized USDC buys and authorized NightToken sells with agent-aware TradeRouter routes. Agents and user wallets share the registry human cap. Same-human token withdrawals remain available during protocol pause before cutoff only when the sender and recipient have the same nonzero live registry human ID and the sender's cached ID matches the recipient's live ID. Relinked wallets cannot use an old cached ID. Transfers from the settler to ordinary holders are blocked during either global or token pause, with no settler exemption. See the pause matrix in CONTRACTS.md. Cutoff settlement and batching pay remaining holdings to the agent wallet, whose USDC can then be swept by authorization.

Run `forge build --offline`, `forge test --offline` and `forge build --offline --sizes`. The x402 tests use a real local PoolManager and captured Permit2 runtime without RPC. X402Flow covers buy, recall, sell, paused withdrawal, cutoff refunds, USDC conservation and deployment manifest serialization. The optional ForkFlow test now includes x402 buys and sells but was not run against the shared fork for this change. No Docker command, deployment broadcast or edit to deployments/5042-fork.json was performed.

The next coordinator deployment exports X402Settler, NightTokenDeployer, USDC_EIP712 and their ABIs. The shell wrapper defaults USDC_EIP712_NAME to USDC and USDC_EIP712_VERSION to 2. Existing deployed contracts and manifests must be regenerated together because the Deployment tuple gains its final settler field.

X402Settler keeps `transferWithAuthorization` as its payment method and has no recovery function for consumed authorizations. A consumed nonce does not reveal which value it moved, so the settler cannot safely calculate a refund from it. Successful buys and sells leave no payment funds stranded, and buys return unused payment funds atomically. A payment sent straight to the settler outside `buy` or `sell`, including a USDC authorization submitted directly to USDC, is not recoverable through the settler. This is an accepted limitation. Subsequent trades preserve those funds through their per call balance checks. See CONTRACTS.md for details.
