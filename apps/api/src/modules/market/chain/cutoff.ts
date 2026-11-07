import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { CutoffClaimSchema } from "@night-shares/proto/market/v1/market_pb";
import type { Address } from "viem";
import type { NightConfig } from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import { toProto } from "../../../shared/night-key";
import type { Deps } from "../use-cases/context";
import { ownedWallets, refreshPosition } from "./positions";
import { chainMarket, confirmed, nightHash } from "./runtime";
export async function releaseChainCutoff(deps: Deps) {
  const { reader, executor, custody } = chainMarket(deps.ports);
  const now = (await reader.head()).timestamp;
  const keeper = await custody.createWallet({
    kind: "system",
    name: "market-cutoff",
  });
  await deps.ports.provisionWallet?.(keeper);
  const errors: unknown[] = [];
  for (const record of deps.ports.inventory.list()) {
    const night = nightHash(record.key);
    const token = (
      await reader.read<Address>({
        contract: "NightFactory",
        functionName: "tokenOf",
        args: [night],
      })
    ).value;
    if (/^0x0{40}$/i.test(token)) continue;
    const config = (
      await reader.read<NightConfig>({
        contract: "NightFactory",
        functionName: "config",
        args: [night],
      })
    ).value;
    if (config.cutoff > now) continue;
    try {
      const settled = (
        await reader.read<boolean>({
          contract: "Settlement",
          functionName: "cutoffSettled",
          args: [night],
        })
      ).value;
      if (!settled)
        confirmed(
          await executor.execute({
            operationId: `cutoff:${reader.fingerprint}:${night}`,
            walletId: keeper.walletId,
            command: { kind: "settleCutoff", night },
          }),
        );
      deps.ports.inventory.update(record.key, (r) => ({
        ...r,
        released: true,
        stopped: true,
      }));
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Cutoff settlements failed.");
}
export async function claimChainCutoff(deps: Deps, user: User, key: string) {
  const { reader, executor } = chainMarket(deps.ports);
  const night = nightHash(key);
  let amount = 0n,
    size = 0n;
  let at = Number((await reader.head()).timestamp) * 1000;
  for (const wallet of await ownedWallets(deps, user)) {
    const before = await refreshPosition(deps, user, key, wallet.address);
    if (!before.value.claimable) continue;
    const result = await executor.execute({
      operationId: `claim:${reader.fingerprint}:${night}:${wallet.walletId}`,
      walletId: wallet.walletId,
      command: { kind: "claim", night },
    });
    confirmed(result);
    const after = await refreshPosition(deps, user, key, wallet.address);
    if (!after.value.claimed)
      throw new Error("Claim receipt requires reconciliation.");
    amount += before.value.claimable;
    size += before.value.cutoffBalance;
    at = Number(after.block.timestamp) * 1000;
  }
  return {
    claim: create(CutoffClaimSchema, {
      night: toProto(key),
      amount: { micros: amount },
      size: { tenths: Number(size / 100000000000000000n) },
      claimedAt: timestampFromMs(at),
    }),
    alreadyClaimed: amount === 0n,
  };
}
