import { PRESETS, toMicros } from "@night-shares/market-model";
import { type Address, keccak256, toBytes, toHex, zeroAddress } from "viem";
import { transaction } from "../../../db/transaction";
import {
  type ChainCommand,
  deserialize,
  serialize,
  soliditySeconds,
} from "../../../ports/chain-executor/chain-executor";
import { DomainError } from "../../../shared/errors/domain-error";
import { configureChainInventory } from "../../inventory/chain-draft";
import { openAllotment } from "../../inventory/mutations/open-allotment";
import { mapNight, releaseMs } from "../mappers/night";
import type { HostDeps } from "../use-cases/deps";
import type { selectNights } from "../use-cases/opening/selection";
import { hostWallet } from "./bind";
import { chainPorts, executeIntent, RevertedHostOperation } from "./execute";

type Plan = ReturnType<typeof selectNights>[number];
type Payload = {
  command: Extract<ChainCommand, { kind: "open" }>;
  plan: Plan;
  walletId: string;
};

export async function openChainNights(
  deps: HostDeps,
  userId: string,
  plans: Plan[],
) {
  const { ports, repo } = deps;
  const { reader } = chainPorts(ports);
  configureChainInventory(ports.db, reader.fingerprint);
  const wallet = await hostWallet(deps, userId);
  const value = async <T>(
    contract: string,
    functionName: string,
    args: readonly unknown[] = [],
  ) => (await reader.read<T>({ contract, functionName, args })).value;
  const results = [];
  for (const plan of plans) {
    const { record } = plan;
    const key = record.key;
    let row = ports.db
      .query<{ payload: string; status: string }, [string, string]>(
        "SELECT payload, status FROM host_chain_openings WHERE fingerprint = ? AND night_key = ?",
      )
      .get(reader.fingerprint, key);
    if (row?.status === "failed") throw new RevertedHostOperation();
    if (row?.status === "complete" || (!row && record.openedAt > 0))
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Opened-night allotment edits are not supported on chain networks.",
      );
    if (!row) {
      if (
        (await value<bigint>("Settlement", "incidents", [wallet.address])) >= 2n
      )
        throw new DomainError(
          "FAILED_PRECONDITION",
          "New openings are suspended after repeated walked guests.",
        );
      const rooms = plan.tenths / 10;
      if (!Number.isInteger(rooms) || rooms < 1 || rooms > 100)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Chain openings require 1 to 100 whole rooms.",
        );
      const property = keccak256(toBytes(record.propertyId));
      if (
        (
          await value<Address>("NightFactory", "ownerOf", [property])
        ).toLowerCase() !== wallet.address.toLowerCase()
      )
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Opening requires the permanently bound payout custody wallet.",
        );
      const config = {
        F: toMicros(record.state.F),
        k: BigInt(Math.round(PRESETS[plan.preset] * 1e18)),
        S: BigInt(rooms) * 10n ** 18n,
        X: 0n,
        cutoff: soliditySeconds(releaseMs(record.date, plan.releasePolicy)),
        host: wallet.address,
        property,
        roomType: keccak256(toBytes(record.roomTypeId)),
        night: keccak256(toBytes(key)),
        checkIn: soliditySeconds(Date.parse(`${record.date}T15:00:00Z`)),
      };
      if (
        config.cutoff <= (await reader.head()).timestamp ||
        config.F > (await value<bigint>("NightFactory", "MAX_F")) ||
        config.S > (await value<bigint>("NightFactory", "MAX_S")) ||
        (await value<bigint>("NightFactory", "openNights")) >=
          (await value<bigint>("NightFactory", "MAX_OPEN_NIGHTS")) ||
        (await value<bigint>("NightFactory", "poolCost", [config])) >
          (await value<bigint>("NightFactory", "MAX_POOL"))
      )
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Opening exceeds chain price, capacity, or cutoff limits.",
        );
      const dependencies = await value<{ usdc: Address }>(
        "NightFactory",
        "dependencies",
      );
      let salt = toHex(0, { size: 32 });
      for (let i = 0; ; i++) {
        if (i >= 100000) throw new Error("Unable to mine a valid token salt.");
        salt = toHex(i, { size: 32 });
        if (
          BigInt(
            await value<Address>("NightFactory", "predictToken", [
              config,
              salt,
            ]),
          ) < BigInt(dependencies.usdc)
        )
          break;
      }
      const payload: Payload = {
        command: {
          kind: "open",
          propertyId: record.propertyId,
          roomTypeId: record.roomTypeId,
          date: record.date,
          config,
          salt,
        },
        plan,
        walletId: wallet.walletId,
      };
      // PMS confirms capacity before the first irreversible transaction.
      await ports.channelManager.pushInventory([
        { nightKey: key, allotmentTenths: plan.tenths, stopped: true },
      ]);
      transaction(ports.db, () => {
        ports.db
          .query(
            "INSERT INTO host_chain_openings (fingerprint, night_key, user_id, payload) VALUES (?, ?, ?, ?)",
          )
          .run(reader.fingerprint, key, userId, serialize(payload));
        ports.db
          .query("INSERT INTO market_settlements VALUES (?, ?)")
          .run(`host-chain:${reader.fingerprint}:${key}`, key);
      });
      row = { payload: serialize(payload), status: "pending" };
    }
    const saved = deserialize<Payload>(row.payload);
    if (
      saved.plan.tenths !== plan.tenths ||
      saved.plan.preset !== plan.preset ||
      saved.plan.releasePolicy !== plan.releasePolicy
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Retry the original opening settings; chain config is immutable.",
      );
    const night = saved.command.config.night;
    if (
      (await value<Address>("NightFactory", "tokenOf", [night])) === zeroAddress
    )
      try {
        await executeIntent(ports, `open:${key}`, async () => ({
          operationId: "",
          walletId: saved.walletId,
          command: saved.command,
        }));
      } catch (error) {
        if (error instanceof RevertedHostOperation) {
          // Keep the failed intent until PMS compensation acknowledges the original capacity.
          await ports.channelManager.pushInventory([
            {
              nightKey: key,
              allotmentTenths: saved.plan.record.state.S * 10,
              stopped: saved.plan.record.stopped,
            },
          ]);
          transaction(ports.db, () => {
            ports.db
              .query(
                "UPDATE host_chain_openings SET status = 'failed' WHERE fingerprint = ? AND night_key = ?",
              )
              .run(reader.fingerprint, key);
            ports.db
              .query("DELETE FROM market_settlements WHERE id = ?")
              .run(`host-chain:${reader.fingerprint}:${key}`);
          });
        }
        throw error;
      }
    const actual = await value<typeof saved.command.config>(
      "NightFactory",
      "config",
      [night],
    );
    for (const field of [
      "F",
      "k",
      "S",
      "cutoff",
      "host",
      "property",
      "roomType",
      "night",
      "checkIn",
    ] as const)
      if (
        String(actual[field]).toLowerCase() !==
        String(saved.command.config[field]).toLowerCase()
      )
        throw new Error(`Opened config mismatch: ${field}.`);
    while (!(await value<boolean>("NightFactory", "ladderComplete", [night]))) {
      const fromRoom = await value<bigint>("NightVault", "nextRoom", [night]);
      const rooms = actual.S / 10n ** 18n;
      const toRoom = BigInt(Math.min(Number(fromRoom) + 10, Number(rooms)));
      await executeIntent(ports, `chunk:${key}:${fromRoom}`, async () => ({
        operationId: "",
        walletId: saved.walletId,
        command: { kind: "addChunk", night, fromRoom, toRoom },
      }));
    }
    ports.db
      .query(
        "UPDATE host_chain_openings SET status = 'pms_pending' WHERE fingerprint = ? AND night_key = ?",
      )
      .run(reader.fingerprint, key);
    try {
      await ports.channelManager.pushInventory([
        { nightKey: key, allotmentTenths: saved.plan.tenths, stopped: false },
      ]);
    } catch {
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Night opened on chain; hotel acknowledgement is pending. Retry the same opening to synchronize.",
      );
    }
    const confirmed = await reader.head();
    const updated = transaction(ports.db, () => {
      const result = ports.inventory.update(key, () => ({
        ...openAllotment(
          {
            ...saved.plan.record,
            state: {
              ...saved.plan.record.state,
              q: 0,
              booked: 0,
              held: 0,
              traderAsks: [],
            },
          },
          {
            tenths: saved.plan.tenths,
            preset: saved.plan.preset,
            floor: saved.plan.record.state.F,
          },
          Number(confirmed.timestamp) * 1000,
        ),
        cutoffAt: Number(actual.cutoff) * 1000,
        chainFingerprint: reader.fingerprint,
        chainBlock: confirmed.number.toString(),
      }));
      repo.setRelease(key, saved.plan.releasePolicy);
      ports.activity.append({
        nightKey: key,
        propertyId: record.propertyId,
        kind: "nights_opened",
        tenths: saved.plan.tenths,
        actor: "host",
        userId,
      });
      ports.db
        .query(
          "UPDATE host_chain_openings SET status = 'complete' WHERE fingerprint = ? AND night_key = ?",
        )
        .run(reader.fingerprint, key);
      ports.db
        .query("DELETE FROM market_settlements WHERE id = ?")
        .run(`host-chain:${reader.fingerprint}:${key}`);
      return result;
    });
    results.push(mapNight(updated, repo));
  }
  return results;
}
