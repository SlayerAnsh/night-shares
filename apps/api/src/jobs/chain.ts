import { type Address, type Hex, zeroAddress } from "viem";
import type { Ports } from "../container/ports";
import { recoverHostOpenings } from "../modules/host/chain/recover";
import { askRows } from "../modules/market/chain/asks";
import { refreshPosition } from "../modules/market/chain/positions";
import { recoverChainMarket } from "../modules/market/chain/recovery";
import {
  chainMarket,
  confirmed,
  nightHash,
} from "../modules/market/chain/runtime";
import { createSqliteMarketRepo } from "../modules/market/repo/market-repo.sqlite";
import { recoverStayChain } from "../modules/stay/chain/recovery";
import {
  type Ask,
  type ChainCommand,
  deserialize,
  type NightConfig,
} from "../ports/chain-executor/chain-executor";
import type { User } from "../ports/sessions/session-store";

/** All chain work is gated by deployment validation, before any local finalization. */
export async function runChainJobs(ports: Ports) {
  const { reader, executor, custody, deployment } = chainMarket(ports);
  await reader.assertCurrent();
  const target = (await reader.head()).number;
  let indexed = await reader.poll();
  while (indexed.number < target) indexed = await reader.poll();
  if (indexed.number < (await reader.head()).number) return;
  const errors: unknown[] = [];
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      errors.push(error);
    }
  };
  for (const id of executor.pending()) {
    await attempt(async () => {
      const result = await executor.recover(id);
      if (result.state !== "reverted") confirmed(result);
    });
  }
  const deps = { ports, repo: createSqliteMarketRepo(ports.db) };
  await attempt(async () => {
    const failures = await recoverHostOpenings(ports);
    if (failures?.length)
      throw new AggregateError(failures, "Host recovery remains pending.");
  });
  await attempt(() => recoverChainMarket(deps));
  await attempt(() => recoverStayChain(ports));
  const keeper = await custody.createWallet({
    kind: "system",
    name: "scheduled-chain",
  });
  await ports.provisionWallet?.(keeper);
  const send = async (key: string, command: ChainCommand) => {
    // Stable IDs preserve signed transactions across a crash before projection.
    confirmed(
      await executor.execute({
        operationId: `jobs:${reader.fingerprint}:${key}`,
        walletId: keeper.walletId,
        command,
      }),
    );
  };
  const head = await reader.head();
  const nights = new Set<Hex>();
  for (const record of ports.inventory.list()) {
    await attempt(async () => {
      const night = nightHash(record.key);
      const token = (
        await reader.read<Address>({
          contract: "NightFactory",
          functionName: "tokenOf",
          args: [night],
        })
      ).value;
      if (token === zeroAddress) return;
      nights.add(night);
      const config = (
        await reader.read<NightConfig>({
          contract: "NightFactory",
          functionName: "config",
          args: [night],
        })
      ).value;
      const settled = (
        await reader.read<boolean>({
          contract: "Settlement",
          functionName: "cutoffSettled",
          args: [night],
        })
      ).value;
      if (!settled && config.cutoff <= head.timestamp) {
        await send(`cutoff:${night}`, { kind: "settleCutoff", night });
      }
      const released = (
        await reader.read<boolean>({
          contract: "Settlement",
          functionName: "cutoffSettled",
          args: [night],
        })
      ).value;
      if (released) {
        ports.inventory.update(record.key, (r) => ({
          ...r,
          released: true,
          stopped: true,
        }));
        const cursor = (
          await reader.read<Address>({
            contract: "Settlement",
            functionName: "cursor",
            args: [night],
          })
        ).value;
        if (cursor !== zeroAddress)
          await send(`push:${night}:${cursor}`, {
            kind: "pushBatch",
            night,
            count: 100n,
          });
      } else {
        // Each tick may collect newly earned positions; the execution journal owns recovery.
        await send(`sweep:${night}:${head.hash}`, { kind: "sweep", night });
      }
    });
  }
  const users = ports.db
    .query<User, []>(
      "SELECT id, human_id AS humanId, wallet_address AS walletAddress, level FROM identity_users",
    )
    .all();
  for (const record of ports.inventory.list()) {
    if (!nights.has(nightHash(record.key))) continue;
    for (const user of users) {
      await attempt(() =>
        refreshPosition(deps, user, record.key, user.walletAddress as Address),
      );
    }
  }
  // Invalidate eventless expiry and externally bumped maker nonces at chain time.
  for (const row of askRows(deps)) {
    await attempt(async () => {
      const ask = deserialize<Ask>(row.payload);
      const nonce = (
        await reader.read<bigint>({
          contract: "TradeRouter",
          functionName: "nonces",
          args: [row.maker],
        })
      ).value;
      const filled = (
        await reader.read<bigint>({
          contract: "TradeRouter",
          functionName: "filled",
          args: [row.digest],
        })
      ).value;
      const status =
        nonce !== ask.order.nonce
          ? "cancelled"
          : head.timestamp >= ask.order.expiry
            ? "expired"
            : filled >= ask.order.size
              ? "filled"
              : undefined;
      if (status)
        ports.db
          .query(
            "UPDATE market_chain_asks SET status = ? WHERE fingerprint = ? AND digest = ?",
          )
          .run(status, reader.fingerprint, row.digest);
    });
  }
  // Include permanent payout addresses, which need not belong to API custody.
  const recipients = ports.db
    .query<{ address: Address }, []>(
      "SELECT address FROM anvil_wallets UNION SELECT payout AS address FROM host_chain_bindings WHERE fingerprint = (SELECT fingerprint FROM chain_instances WHERE active = 1 LIMIT 1)",
    )
    .all();
  const addresses = new Set(recipients.map((row) => row.address));
  for (const address of [
    deployment.PLATFORM,
    deployment.CoverFund,
    deployment.RebatePool,
  ])
    if (address) addresses.add(address);
  for (const recipient of addresses) {
    for (const contract of [
      "NightHook",
      "Settlement",
      "NightToken",
      "NightVault",
    ] as const) {
      for (const night of contract === "NightToken" ? nights : [undefined]) {
        await attempt(async () => {
          const request = {
            contract,
            night,
            functionName: "credits",
            args: [recipient],
          };
          reader.watch(
            `credit:${contract}:${night ?? ""}:${recipient}`,
            request,
          );
          const credit = await reader.read<bigint>(request);
          if (credit.value > 0n)
            await send(
              `credit:${contract}:${night ?? ""}:${recipient}:${credit.block.hash}`,
              { kind: "withdrawCredit", contract, night, recipient },
            );
        });
      }
    }
  }
  await reader.poll();
  if (errors.length)
    throw new AggregateError(errors, "Chain jobs require reconciliation.");
}
