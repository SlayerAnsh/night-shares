import { type Address, type Hex, zeroAddress } from "viem";
import type { Ports } from "../../../container/ports";
import {
  deserialize,
  type NightConfig,
} from "../../../ports/chain-executor/chain-executor";
import { DomainError } from "../../../shared/errors/domain-error";
import { format, parse } from "../../../shared/night-key";
import { chainMarket, nightHash } from "./runtime";

/** Resolve catalog identities from factory events, then verify live factory state. */
export async function openedNights(ports: Ports) {
  const { reader } = chainMarket(ports);
  await reader.poll(1000);
  const keys = new Set(
    ports.inventory
      .list()
      .filter(
        (r) => r.openedAt > 0 && r.chainFingerprint === reader.fingerprint,
      )
      .map((r) => r.key),
  );
  for (const row of ports.db
    .query<{ args: string }, [string]>(
      "SELECT args FROM chain_events WHERE fingerprint = ? AND event = 'NightOpened'",
    )
    .all(reader.fingerprint)) {
    const event = deserialize<{ night: Hex }>(row.args);
    const { value: config } = await reader.read<NightConfig>({
      contract: "NightFactory",
      functionName: "config",
      args: [event.night],
    });
    const property = ports.catalog
      .list()
      .find((p) => nightHash(p.id) === config.property);
    const room = property?.roomTypes.find(
      (r) => nightHash(r.id) === config.roomType,
    );
    if (property && room)
      keys.add(
        format({
          propertyId: property.id,
          roomTypeId: room.id,
          date: new Date(Number(config.checkIn) * 1000)
            .toISOString()
            .slice(0, 10),
        }),
      );
  }
  const records = [];
  for (const key of keys) {
    const token = (
      await reader.read<Address>({
        contract: "NightFactory",
        functionName: "tokenOf",
        args: [nightHash(key)],
      })
    ).value;
    if (token !== zeroAddress) records.push(await openedNight(ports, key));
    else
      ports.inventory.update(key, (record) => ({
        ...record,
        openedAt: 0,
        stopped: true,
      }));
  }
  return records;
}

export async function openedNight(ports: Ports, key: string) {
  const { reader } = chainMarket(ports);
  const night = nightHash(key);
  const head = await reader.head();
  const token = (
    await reader.read<Address>(
      { contract: "NightFactory", functionName: "tokenOf", args: [night] },
      head.number,
    )
  ).value;
  if (token === zeroAddress)
    throw new DomainError("NOT_FOUND", "Night is not open on chain.");
  const { value: config } = await reader.read<NightConfig>(
    { contract: "NightFactory", functionName: "config", args: [night] },
    head.number,
  );
  const read = async (functionName: string) =>
    (
      await reader.read<bigint>(
        { contract: "NightToken", night, functionName },
        head.number,
      )
    ).value;
  const held = Number(await read("held")) / 1e18;
  const booked = Number(await read("burned")) / 1e18;
  const record = ports.inventory.seedNight(parse(key));
  const projected = {
    ...record,
    chainFingerprint: reader.fingerprint,
    chainBlock: head.number.toString(),
    openedAt: Number(head.timestamp) * 1000,
    cutoffAt: Number(config.cutoff) * 1000,
    stopped: config.cutoff <= head.timestamp,
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
