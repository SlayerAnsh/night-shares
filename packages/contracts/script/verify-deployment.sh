#!/bin/sh
# Verify every Night Shares contract of one deployment record on a Blockscout explorer.
# Read only: no keys, no transactions. Run from packages/contracts with dependencies installed
# (sh script/install-deps.sh) and the source at the deployed commit.
#
# Usage:
#   sh script/verify-deployment.sh                      # Arc mainnet, deployments/5042.json
#   DEPLOYMENT=deployments/5042002.json \
#   VERIFIER_URL=https://testnet.arcscan.app/api/ \
#   RPC_URL=https://rpc.testnet.arc.network sh script/verify-deployment.sh
set -u

DEPLOYMENT=${DEPLOYMENT:-deployments/5042.json}
VERIFIER_URL=${VERIFIER_URL:-https://explorer.arc.io/api/}
RPC_URL=${RPC_URL:-https://rpc.mainnet.arc.io}
TRIES=${TRIES:-6}
PAUSE=${PAUSE:-15}

[ -f "$DEPLOYMENT" ] || { echo "missing $DEPLOYMENT" >&2; exit 1; }

# name, source path:contract
CONTRACTS="NightFactory src/NightFactory.sol:NightFactory
NightHook src/NightHook.sol:NightHook
NightVault src/NightVault.sol:NightVault
TradeRouter src/TradeRouter.sol:TradeRouter
BookingRouter src/BookingRouter.sol:BookingRouter
Settlement src/Settlement.sol:Settlement
CoverFund src/CoverFund.sol:CoverFund
RebatePool src/RebatePool.sol:RebatePool
HumanRegistry src/HumanRegistry.sol:HumanRegistry
X402Settler src/X402Settler.sol:X402Settler
NightTokenDeployer src/NightTokenDeployer.sol:NightTokenDeployer
HookDeployer script/DeployLib.sol:HookDeployer"

echo "$CONTRACTS" | while read -r name path; do
  address=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$DEPLOYMENT" "$name")
  try=1
  result="FAIL"
  while [ "$try" -le "$TRIES" ]; do
    out=$(forge verify-contract "$address" "$path" --verifier blockscout --verifier-url "$VERIFIER_URL" \
      --rpc-url "$RPC_URL" --guess-constructor-args --watch 2>&1)
    if echo "$out" | grep -qiE "already verified|successfully verified|Pass - Verified|Contract successfully"; then
      result="OK"
      break
    fi
    if echo "$out" | grep -qiE "too many|rate limit|429|timed out|timeout"; then
      sleep $((try * 20))
      try=$((try + 1))
      continue
    fi
    break
  done
  if [ "$result" = "OK" ]; then
    echo "$name $address verified"
  else
    echo "$name $address FAILED: $(echo "$out" | tail -2 | tr '\n' ' ')"
  fi
  sleep "$PAUSE"
done
