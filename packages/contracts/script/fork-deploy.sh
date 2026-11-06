#!/bin/sh
set -eu
cd /contracts
export RPC_URL=http://chain:8545
# The endpoint is deliberately fixed to the compose service. Never pass a remote RPC here.
cast rpc --rpc-url "$RPC_URL" anvil_nodeInfo >/dev/null
export CHAIN_ID=5042 FORK_ONLY=true DEPLOYMENT_NAME=5042-fork
export POOL_MANAGER=0x8366a39CC670B4001A1121B8F6A443A643e40951
export USDC=0x3600000000000000000000000000000000000000
export PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3
export ATTESTER=0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
export PLATFORM=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Public Anvil test wallets, never production keys.
for wallet in $(cast wallet derive 'test test test test test test test test test test test junk' --accounts 10 --json | python3 -c 'import json,sys; print(" ".join(x["address"] for x in json.load(sys.stdin)))'); do
  # Public mnemonic accounts may already have EIP-7702 delegation on the upstream chain.
  cast rpc --rpc-url "$RPC_URL" anvil_setCode "$wallet" 0x >/dev/null
  cast rpc --rpc-url "$RPC_URL" anvil_setBalance "$wallet" 0x21e19e0c9bab2400000 >/dev/null
done
runtime=$(python3 -c 'import json; print(json.load(open("out/MockUSDC.sol/MockUSDC.json"))["deployedBytecode"]["object"])')
[ "${#runtime}" -gt 100 ]
cast rpc --rpc-url "$RPC_URL" anvil_setCode "$USDC" "$runtime" >/dev/null
mkdir -p deployments
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --broadcast --slow --non-interactive
forge script script/Seed.s.sol:Seed --rpc-url "$RPC_URL" --broadcast --slow --non-interactive
# Preserve only public receipt data, never the broadcast cache containing signing material.
python3 - <<'PY'
import json, os
from pathlib import Path
path = Path('deployments/5042-fork.json')
data = json.loads(path.read_text())
data['simulationBlock'] = data['block']
data['transactions'] = []
blocks = []
for name in ('Deploy.s.sol', 'Seed.s.sol'):
    run = json.loads(Path(f'broadcast/{name}/5042/run-latest.json').read_text())
    for receipt in run['receipts']:
        assert int(receipt['status'], 16) == 1, receipt
        data['transactions'].append(receipt['transactionHash'])
        blocks.append(int(receipt['blockNumber'], 16))
data['block'] = max(blocks)
data['forkBlock'] = int(os.environ.get('ARC_FORK_BLOCK', '29914738'))
path.write_text(json.dumps(data, indent=2) + '\n')
PY
