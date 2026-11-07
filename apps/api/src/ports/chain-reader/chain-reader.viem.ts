import type { Database } from "bun:sqlite";
import {
  type Abi,
  type Address,
  decodeEventLog,
  type Hex,
  type Log,
  zeroAddress,
} from "viem";
import { type Pool, readPoolAt } from "../../modules/market/chain/pool";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import {
  type ForkClient,
  validateDeployment,
} from "../arc-deployment/validate";
import { deserialize, serialize } from "../chain-executor/chain-executor";
import { commandCall, permit2Abi, usdcAbi } from "../chain-executor/codecs";
import type { BlockStamp, ChainReader, ReadRequest } from "./chain-reader";
export function createChainReader(
  db: Database,
  d: ArcDeployment,
  client: ForkClient,
  fingerprint: string,
): ChainReader {
  db.transaction(() => {
    db.query(
      "UPDATE chain_instances SET active = 0 WHERE fingerprint != ?",
    ).run(fingerprint);
    db.query(
      "UPDATE chain_operations SET state = 'needs_reconciliation' WHERE fingerprint != ? AND state != 'finalized' AND state != 'reverted'",
    ).run(fingerprint);
    db.query("INSERT OR REPLACE INTO chain_instances VALUES (?, ?, 1)").run(
      fingerprint,
      serialize(d),
    );
  }).immediate();
  const blockAt = async (blockNumber?: bigint): Promise<BlockStamp> => {
    const b = await client.getBlock(
      blockNumber === undefined ? {} : { blockNumber },
    );
    if (!b.hash || b.number === null)
      throw new Error("Missing canonical block.");
    return { number: b.number, hash: b.hash, timestamp: b.timestamp };
  };
  const fixed = Object.entries(d).filter(
    ([, v]) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v),
  );
  const reduce = (logs: Log[]) => {
    for (const log of logs) {
      if (
        log.blockNumber === null ||
        !log.blockHash ||
        !log.transactionHash ||
        log.logIndex === null
      )
        continue;
      const name = fixed.find(
        ([, v]) => String(v).toLowerCase() === log.address.toLowerCase(),
      )?.[0];
      const abi =
        name === "USDC" ? usdcAbi : name ? d.abis[name] : d.abis.NightToken;
      if (!abi) continue;
      const decoded = (() => {
        try {
          return decodeEventLog({ abi, data: log.data, topics: log.topics });
        } catch {
          return undefined;
        }
      })();
      if (!decoded) continue;
      if (name === "NightFactory" && decoded.eventName === "NightOpened") {
        const args = decoded.args as unknown as { night: Hex; token: Address };
        db.query(
          "INSERT OR REPLACE INTO chain_nights VALUES (?, ?, ?, ?, ?)",
        ).run(
          fingerprint,
          args.night,
          args.token,
          log.blockNumber,
          log.blockHash,
        );
      }
      // Database errors must propagate: receipt finalization must remain replayable.
      db.query(
        "INSERT OR IGNORE INTO chain_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        fingerprint,
        log.blockNumber,
        log.blockHash,
        log.transactionHash,
        log.logIndex,
        log.address,
        decoded.eventName ?? "",
        serialize(decoded.args),
      );
    }
  };
  const saveMarket = (night: Hex, value: Pool) => {
    const previous = db
      .query<{ value: string }, [string, string]>(
        "SELECT value FROM chain_market_snapshots WHERE fingerprint = ? AND night = ?",
      )
      .get(fingerprint, night);
    if (
      previous &&
      deserialize<Pool>(previous.value).block.number > value.block.number
    )
      return;
    db.query(
      "INSERT OR REPLACE INTO chain_market_snapshots VALUES (?, ?, ?)",
    ).run(fingerprint, night, serialize(value));
  };
  const reader: ChainReader = {
    fingerprint,
    client,
    head: () => blockAt(),
    async assertCurrent() {
      if ((await validateDeployment(d, client)) !== fingerprint)
        throw new Error(
          "Deployment fingerprint changed; quarantine and restart required.",
        );
    },
    async tokenOf(night, blockNumber) {
      const projected = db
        .query<{ token: Address; block_number: number }, [string, string]>(
          "SELECT token, block_number FROM chain_nights WHERE fingerprint = ? AND night = ?",
        )
        .get(fingerprint, night);
      if (
        projected &&
        (blockNumber === undefined ||
          BigInt(projected.block_number) <= blockNumber)
      )
        return projected.token;
      const token = (await client.readContract({
        address: d.NightFactory,
        abi: d.abis.NightFactory ?? [],
        functionName: "tokenOf",
        args: [night],
        blockNumber,
      })) as Address;
      if (token === zeroAddress) throw new Error("Unknown night.");
      return token;
    },
    async read<T>(request: ReadRequest, blockNumber?: bigint) {
      const block = await blockAt(blockNumber);
      const address =
        request.contract === "NightToken"
          ? await reader.tokenOf(request.night as Hex, block.number)
          : d[request.contract as "TradeRouter"];
      if (!address) throw new Error("Unknown deployment contract.");
      const abi: Abi =
        request.contract === "USDC"
          ? usdcAbi
          : request.contract === "PERMIT2"
            ? permit2Abi
            : (d.abis[request.contract] ?? []);
      const value = (await client.readContract({
        address,
        abi,
        functionName: request.functionName,
        args: request.args,
        blockNumber: block.number,
      })) as T;
      return { block, value };
    },
    async cash(address, blockNumber) {
      const block = await blockAt(blockNumber);
      const [native, usdc] = await Promise.all([
        client.getBalance({ address, blockNumber: block.number }),
        client.readContract({
          address: d.USDC,
          abi: usdcAbi,
          functionName: "balanceOf",
          args: [address],
          blockNumber: block.number,
        }),
      ]);
      return { block, value: { native, usdc } };
    },
    async simulate(command, sender) {
      await reader.assertCurrent();
      const block = await blockAt();
      const call = await commandCall(d, command, (night) =>
        reader.tokenOf(night, block.number),
      );
      const result = await client.simulateContract({
        ...call,
        account: sender,
        blockNumber: block.number,
      });
      return { block, value: result.result };
    },
    watch(key, request) {
      db.query("INSERT OR REPLACE INTO chain_watches VALUES (?, ?, ?)").run(
        fingerprint,
        key,
        serialize(request),
      );
    },
    async ingest(receipt) {
      const block = await blockAt(receipt.blockNumber);
      if (block.hash !== receipt.blockHash)
        throw new Error("Receipt is not canonical.");
      db.transaction(() => reduce(receipt.logs)).immediate();
      const addresses = new Set(
        receipt.logs.map((log) => log.address.toLowerCase()),
      );
      const nights = db
        .query<{ night: Hex; token: Address }, [string, bigint]>(
          "SELECT night, token FROM chain_nights WHERE fingerprint = ? AND block_number <= ?",
        )
        .all(fingerprint, block.number);
      for (const { night, token } of nights) {
        if (
          !addresses.has(token.toLowerCase()) &&
          !addresses.has(d.NightFactory.toLowerCase()) &&
          !addresses.has(d.NightVault.toLowerCase())
        )
          continue;
        const pool = await readPoolAt(d, client, night, token, block);
        saveMarket(night, pool);
        db.query(
          "INSERT INTO chain_snapshots VALUES (?, ?, ?, ?, ?) ON CONFLICT(fingerprint, key) DO UPDATE SET block_number = excluded.block_number, block_hash = excluded.block_hash, value = excluded.value WHERE excluded.block_number >= chain_snapshots.block_number",
        ).run(
          fingerprint,
          "market:paused",
          block.number,
          block.hash,
          serialize(pool.paused),
        );
      }
    },
    async poll(maxBlocks = 100) {
      if (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1)
        throw new Error("Invalid block batch.");
      maxBlocks = Math.min(maxBlocks, 9999);
      await reader.assertCurrent();
      let cursor = db
        .query<{ number: bigint; hash: string }, [string]>(
          "SELECT number, hash FROM chain_blocks WHERE fingerprint = ? ORDER BY number DESC LIMIT 1",
        )
        .get(fingerprint);
      let cursorCanonical = true;
      if (cursor) {
        try {
          cursorCanonical =
            (await blockAt(BigInt(cursor.number))).hash === cursor.hash;
        } catch (error) {
          if (!(error instanceof Error) || error.name !== "BlockNotFoundError")
            throw error;
          cursorCanonical = false;
        }
      }
      if (!cursorCanonical) {
        db.transaction(() => {
          for (const table of [
            "chain_blocks",
            "chain_events",
            "chain_snapshots",
            "chain_nights",
            "chain_market_snapshots",
          ])
            db.query(`DELETE FROM ${table} WHERE fingerprint = ?`).run(
              fingerprint,
            );
          db.query(
            "UPDATE chain_operations SET state = 'needs_reconciliation' WHERE fingerprint = ? AND receipt IS NOT NULL",
          ).run(fingerprint);
        }).immediate();
        cursor = null;
      }
      const head = await blockAt();
      const start = cursor
        ? BigInt(cursor.number) + 1n
        : BigInt(d.block as number);
      const end =
        // biome-ignore lint/complexity/useMathMinMax: Math.min does not accept bigint block numbers.
        head.number < start + BigInt(maxBlocks - 1)
          ? head.number
          : start + BigInt(maxBlocks - 1);
      if (start <= end) {
        const n = end;
        const block = await blockAt(n);
        // Read all logs to include tokens created in this very block. Filter by known factory creations.
        const logs = await client.getLogs({ fromBlock: start, toBlock: end });
        const tokens = new Set<string>();
        for (const row of db
          .query<{ args: string }, [string]>(
            "SELECT args FROM chain_events WHERE fingerprint = ? AND event = 'NightOpened'",
          )
          .all(fingerprint)) {
          const args = deserialize<{ token: Address }>(row.args);
          tokens.add(args.token.toLowerCase());
        }
        for (const log of logs.filter(
          (l) => l.address.toLowerCase() === d.NightFactory.toLowerCase(),
        )) {
          try {
            const decoded = decodeEventLog({
              abi: d.abis.NightFactory ?? [],
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "NightOpened")
              tokens.add(
                (
                  decoded.args as unknown as { token: Address }
                ).token.toLowerCase(),
              );
          } catch {
            /* Not a creation log. */
          }
        }
        const filtered = logs.filter(
          (l) =>
            tokens.has(l.address.toLowerCase()) ||
            fixed.some(
              ([, a]) => String(a).toLowerCase() === l.address.toLowerCase(),
            ),
        );
        const snapshots: { key: string; snapshot: { value: unknown } }[] = [];
        for (const watch of db
          .query<{ key: string; request: string }, [string]>(
            "SELECT key, request FROM chain_watches WHERE fingerprint = ?",
          )
          .all(fingerprint)) {
          const request = deserialize<ReadRequest>(watch.request);
          // A reorg replay can precede the creation of a watched token.
          if (request.contract === "NightToken") {
            const token = await reader.read<Address>(
              {
                contract: "NightFactory",
                functionName: "tokenOf",
                args: [request.night],
              },
              n,
            );
            if (token.value === zeroAddress) continue;
          }
          snapshots.push({
            key: watch.key,
            snapshot: await reader.read(request, n),
          });
        }
        const opened = new Map(
          db
            .query<{ night: Hex; token: Address }, [string, bigint]>(
              "SELECT night, token FROM chain_nights WHERE fingerprint = ? AND block_number <= ?",
            )
            .all(fingerprint, n)
            .map((row) => [row.night, row.token]),
        );
        for (const log of filtered) {
          if (log.address.toLowerCase() !== d.NightFactory.toLowerCase())
            continue;
          try {
            const event = decodeEventLog({
              abi: d.abis.NightFactory ?? [],
              data: log.data,
              topics: log.topics,
            });
            if (event.eventName === "NightOpened") {
              const args = event.args as unknown as {
                night: Hex;
                token: Address;
              };
              opened.set(args.night, args.token);
            }
          } catch {
            /* Unrelated factory event. */
          }
        }
        snapshots.push({
          key: "market:paused",
          snapshot: {
            value: await client.readContract({
              address: d.NightHook,
              abi: d.abis.NightHook ?? [],
              functionName: "paused",
              blockNumber: n,
            }),
          },
        });
        const markets: { night: Hex; value: Pool }[] = [];
        for (const [night, token] of opened)
          markets.push({
            night,
            value: await readPoolAt(d, client, night, token, block),
          });
        if ((await blockAt(n)).hash !== block.hash)
          throw new Error("Block changed during reconciliation.");
        db.transaction(() => {
          reduce(filtered);
          for (const market of markets) saveMarket(market.night, market.value);
          for (const { key, snapshot } of snapshots)
            db.query(
              "INSERT OR REPLACE INTO chain_snapshots VALUES (?, ?, ?, ?, ?)",
            ).run(fingerprint, key, n, block.hash, serialize(snapshot.value));
          db.query("INSERT OR REPLACE INTO chain_blocks VALUES (?, ?, ?)").run(
            fingerprint,
            n,
            block.hash,
          );
        }).immediate();
      }
      return end >= start ? blockAt(end) : head;
    },
  };
  return reader;
}
