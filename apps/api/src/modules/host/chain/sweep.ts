import { decodeEventLog, keccak256, parseAbi, toBytes } from "viem";
import { transaction } from "../../../db/transaction";
import type { HostDeps } from "../use-cases/deps";
import { propertyOf } from "../use-cases/property";
import { hostWallet } from "./bind";
import { chainPorts, executeIntent } from "./execute";

const sweepAbi = parseAbi([
  "event Swept(bytes32 indexed property,address indexed owner,uint256 amount,uint256 hostDebtNetted)",
]);

/** Permissionless sweeps use the host custody sender and reconcile only receipt amounts. */
export async function sweepChain(
  deps: HostDeps,
  userId: string,
  propertyId: string,
) {
  const { ports, repo } = deps;
  propertyOf(deps, userId, propertyId);
  const { reader } = chainPorts(ports);
  const wallet = await hostWallet(deps, userId);
  const vault = (
    await reader.read<{ vault: string }>({
      contract: "NightFactory",
      functionName: "dependencies",
    })
  ).value.vault;
  for (const record of ports.inventory.list({ propertyId })) {
    const night = keccak256(toBytes(record.key));
    const opened = ports.db
      .query(
        "SELECT 1 FROM host_chain_openings WHERE fingerprint = ? AND night_key = ? AND status = 'complete'",
      )
      .get(reader.fingerprint, record.key);
    if (!opened) continue;
    const pendingKey = `${reader.fingerprint}:${record.key}`;
    let row = ports.db
      .query<{ id: string }, [string]>(
        "SELECT id FROM host_sweeps WHERE property_id = ? AND status = 'pending'",
      )
      .get(pendingKey);
    if (!row) {
      row = { id: ports.ids.next("chain_sweep") };
      const id = row.id;
      transaction(ports.db, () => {
        ports.db
          .query(
            "INSERT INTO host_sweeps (id, property_id, amount, debt, at, status) VALUES (?, ?, 0, 0, ?, 'pending')",
          )
          .run(id, pendingKey, ports.clock.now());
        ports.db
          .query("INSERT INTO host_chain_sweeps VALUES (?, ?, ?)")
          .run(id, reader.fingerprint, record.key);
      });
    }
    const result = await executeIntent(ports, row.id, async () => ({
      operationId: "",
      walletId: wallet.walletId,
      command: { kind: "sweep", night },
    }));
    let amount = 0n;
    let debt = 0n;
    for (const log of result.receipt?.logs ?? []) {
      if (log.address.toLowerCase() !== vault.toLowerCase()) continue;
      try {
        const event = decodeEventLog({
          abi: sweepAbi,
          data: log.data,
          topics: log.topics,
        });
        if (event.args.property === keccak256(toBytes(propertyId))) {
          amount += event.args.amount - event.args.hostDebtNetted;
          debt += event.args.hostDebtNetted;
        }
      } catch {
        /* Other protocol events do not contribute to the host payout. */
      }
    }
    transaction(ports.db, () => {
      const updated = ports.db
        .query(
          "UPDATE host_sweeps SET property_id = ?, amount = ?, debt = ?, status = 'settled', transaction_id = ? WHERE id = ? AND status = 'pending'",
        )
        .run(propertyId, amount, debt, result.hash ?? "", row.id);
      if (updated.changes) repo.addWithdrawal(propertyId, amount);
    });
  }
}

export async function chainHostLiabilities(
  deps: HostDeps,
  userId: string,
  propertyId: string,
) {
  propertyOf(deps, userId, propertyId);
  const { reader } = chainPorts(deps.ports);
  const property = keccak256(toBytes(propertyId));
  const owner = (
    await reader.read({
      contract: "NightFactory",
      functionName: "ownerOf",
      args: [property],
    })
  ).value;
  const head = await reader.head();
  const read = async (
    contract: string,
    functionName: string,
    args: unknown[],
  ) =>
    (await reader.read<bigint>({ contract, functionName, args }, head.number))
      .value;
  return {
    block: head,
    pending: await read("NightVault", "pending", [property]),
    debt: await read("Settlement", "hostDebt", [owner]),
    incidents: await read("Settlement", "incidents", [owner]),
    payoutCredit: await read("NightVault", "credits", [owner]),
    owedToGuest: await read("Settlement", "guestClaimTotal", [owner]),
  };
}
