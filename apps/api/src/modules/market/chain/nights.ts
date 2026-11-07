import { type Address, zeroAddress } from "viem";
import type { Ports } from "../../../container/ports";
import {
  deserialize,
  serialize,
} from "../../../ports/chain-executor/chain-executor";
import { addDays } from "../../../shared/dates";
import { DomainError } from "../../../shared/errors/domain-error";
import { format, parse } from "../../../shared/night-key";
import { type Pool, readPoolAt } from "./pool";
import { chainMarket, nightHash } from "./runtime";

const indexed = new WeakMap<Ports, string>();
function indexKeys(ports: Ports) {
  const today = ports.clock.today();
  const catalog = ports.catalog.list();
  const version = JSON.stringify([
    today,
    catalog.map((p) => [p.id, p.roomTypes.map((r) => r.id)]),
  ]);
  if (indexed.get(ports) === version) return;
  ports.db
    .transaction(() => {
      const insert = ports.db.query(
        "INSERT OR IGNORE INTO chain_night_keys VALUES (?, ?)",
      );
      for (const property of catalog)
        for (const room of property.roomTypes)
          for (let day = -31; day < 366; day++) {
            const key = format({
              propertyId: property.id,
              roomTypeId: room.id,
              date: addDays(today, day),
            });
            insert.run(nightHash(key), key);
          }
      for (const row of ports.inventory.list())
        insert.run(nightHash(row.key), row.key);
    })
    .immediate();
  indexed.set(ports, version);
}
export function projectedPool(ports: Ports, key: string): Pool | undefined {
  const row = ports.db
    .query<{ value: string }, [string, string]>(
      "SELECT value FROM chain_market_snapshots WHERE fingerprint = ? AND night = ?",
    )
    .get(chainMarket(ports).reader.fingerprint, nightHash(key));
  return row ? deserialize<Pool>(row.value) : undefined;
}
function recordFromPool(ports: Ports, key: string, pool: Pool) {
  const record = ports.inventory.seedNight(parse(key));
  const { config, block } = pool;
  const held = Number(pool.held) / 1e18,
    booked = Number(pool.burned) / 1e18;
  const projected = {
    ...record,
    chainFingerprint: chainMarket(ports).reader.fingerprint,
    chainBlock: block.number.toString(),
    openedAt: Number(block.timestamp) * 1000,
    cutoffAt: Number(config.cutoff) * 1000,
    stopped: config.cutoff <= BigInt(Math.floor(ports.clock.now() / 1000)),
    state: {
      ...record.state,
      F: Number(config.F) / 1e6,
      k: Number(config.k) / 1e18,
      S: Number(config.S) / 1e18,
      held,
      booked,
      q: held + booked,
      traderAsks: [],
    },
  };
  ports.inventory.save(projected);
  return projected;
}
/** Listing never catches up the chain or resolves arbitrary candidate keys by RPC. */
export async function openedNights(ports: Ports) {
  indexKeys(ports);
  const rows = ports.db
    .query<
      { key: string; value: string },
      [string]
    >(`SELECT k.key, s.value FROM chain_nights n
    JOIN chain_night_keys k ON k.night = n.night
    JOIN chain_market_snapshots s ON s.fingerprint = n.fingerprint AND s.night = n.night
    WHERE n.fingerprint = ?`)
    .all(chainMarket(ports).reader.fingerprint);
  return rows.map((row) =>
    recordFromPool(ports, row.key, deserialize<Pool>(row.value)),
  );
}
export async function openedNight(ports: Ports, key: string) {
  parse(key);
  const cached = projectedPool(ports, key);
  if (cached) return recordFromPool(ports, key, cached);
  const { reader, client, deployment } = chainMarket(ports);
  const night = nightHash(key);
  const head = await reader.head();
  const projected = ports.db
    .query<{ token: Address }, [string, string]>(
      "SELECT token FROM chain_nights WHERE fingerprint = ? AND night = ?",
    )
    .get(reader.fingerprint, night);
  const token =
    projected?.token ??
    ((await client.readContract({
      address: deployment.NightFactory,
      abi: deployment.abis.NightFactory ?? [],
      functionName: "tokenOf",
      args: [night],
      blockNumber: head.number,
    })) as Address);
  if (token === zeroAddress)
    throw new DomainError("NOT_FOUND", "Night is not open on chain.");
  const pool = await readPoolAt(deployment, client, night, token, head);
  ports.db
    .transaction(() => {
      ports.db
        .query("INSERT OR IGNORE INTO chain_nights VALUES (?, ?, ?, ?, ?)")
        .run(reader.fingerprint, night, token, head.number, head.hash);
      ports.db
        .query("INSERT OR IGNORE INTO chain_night_keys VALUES (?, ?)")
        .run(night, key);
      ports.db
        .query("INSERT OR REPLACE INTO chain_market_snapshots VALUES (?, ?, ?)")
        .run(reader.fingerprint, night, serialize(pool));
    })
    .immediate();
  ports.db
    .query(
      "INSERT INTO chain_snapshots VALUES (?, ?, ?, ?, ?) ON CONFLICT(fingerprint, key) DO UPDATE SET block_number = excluded.block_number, block_hash = excluded.block_hash, value = excluded.value WHERE excluded.block_number >= chain_snapshots.block_number",
    )
    .run(
      reader.fingerprint,
      "market:paused",
      head.number,
      head.hash,
      serialize(pool.paused),
    );
  return recordFromPool(ports, key, pool);
}
