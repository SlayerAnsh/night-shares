import {
  type Abi,
  type Address,
  encodeAbiParameters,
  type Hex,
  keccak256,
  type StateOverride,
  toHex,
} from "viem";
import type { Ports } from "../../../container/ports";
import type { ChainCommand } from "../../../ports/chain-executor/chain-executor";
import {
  commandCall,
  permit2Abi,
  usdcAbi,
} from "../../../ports/chain-executor/codecs";
import { chainMarket } from "./runtime";

// Discover and verify mapping slots against the deployed getter. No writes are
// sent to the node, and no assumed token storage layout can silently price a trade.
const slots = new WeakMap<Ports, Map<string, Hex>>();
export async function simulateQuote(
  ports: Ports,
  command: Extract<ChainCommand, { kind: "buy" | "sell" }>,
  sender: Address,
) {
  const { reader, client, deployment: d } = chainMarket(ports);
  await reader.assertCurrent();
  const block = await reader.head();
  if (
    (await client.getBlock({ blockNumber: block.number })).hash !== block.hash
  )
    throw new Error("Quote RPC does not match the chain reader.");
  const overrides: StateOverride = [];
  async function override(
    address: Address,
    keys: Address[],
    value: bigint,
    permit = false,
  ) {
    const abi: Abi = permit ? permit2Abi : usdcAbi;
    const functionName = keys.length === 1 ? "balanceOf" : "allowance";
    const cache = slots.get(ports) ?? new Map<string, Hex>();
    slots.set(ports, cache);
    const key = `${reader.fingerprint}:${address}:${keys.join(":")}`;
    let slot = cache.get(key);
    if (!slot) {
      const marker = 123456789n;
      for (let base = 0n; base < 32n; base++) {
        let candidate = toHex(base, { size: 32 });
        for (const account of keys)
          candidate = keccak256(
            encodeAbiParameters(
              [{ type: "address" }, { type: "bytes32" }],
              [account, candidate],
            ),
          );
        const result = await client.readContract({
          address,
          abi,
          functionName,
          args: keys,
          blockNumber: block.number,
          stateOverride: [
            {
              address,
              stateDiff: [
                { slot: candidate, value: toHex(marker, { size: 32 }) },
              ],
            },
          ],
        });
        if ((Array.isArray(result) ? result[0] : result) === marker) {
          slot = candidate;
          cache.set(key, slot);
          break;
        }
      }
    }
    if (!slot)
      throw new Error(
        `Unsupported quote storage layout: ${address} ${functionName}`,
      );
    let entry = overrides.find((entry) => entry.address === address);
    if (!entry) {
      entry = { address, stateDiff: [] };
      overrides.push(entry);
    }
    entry.stateDiff?.push({ slot, value: toHex(value, { size: 32 }) });
  }
  if (command.kind === "buy") {
    await override(d.USDC, [sender], command.maxPaid);
    await override(d.USDC, [sender, d.PERMIT2], command.maxPaid);
    // Permit2 packs amount, expiration, and nonce into one storage word.
    await override(
      d.PERMIT2,
      [sender, d.USDC, d.TradeRouter],
      command.maxPaid | (command.deadline << 160n),
      true,
    );
  } else {
    await override(
      await reader.tokenOf(command.night, block.number),
      [sender, d.TradeRouter],
      command.qty,
    );
  }
  const call = await commandCall(d, command, (night) =>
    reader.tokenOf(night, block.number),
  );
  const result = await client.simulateContract({
    ...call,
    account: sender,
    blockNumber: block.number,
    stateOverride: overrides,
  });
  return { block, value: result.result };
}
