import type { Database } from "bun:sqlite";
import type { Address } from "viem";
import type { ChainExecutor } from "../chain-executor/chain-executor";
import type { CustodyWallet } from "./wallet-custody";

export type GasPolicy = {
  float: bigint;
  lowWater: bigint;
  dailyCap: bigint;
  opsMinBalance: bigint;
};
export function createGasFloat(deps: {
  db: Database;
  fingerprint: string;
  opsAddress: Address;
  policy: GasPolicy;
  getBalance: (address: Address) => Promise<bigint>;
  executor: ChainExecutor;
  now?: () => number;
}) {
  const { db, policy, fingerprint } = deps;
  // Reservations survive process death and count uncertain deliveries against the cap.
  db.exec(`CREATE TABLE IF NOT EXISTS chain_gas_float (
    id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, wallet TEXT NOT NULL,
    day TEXT NOT NULL, amount TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
  )`);
  async function readiness(): Promise<string | undefined> {
    try {
      if ((await deps.getBalance(deps.opsAddress)) < policy.opsMinBalance)
        return "Ops native balance below CHAIN_OPS_MIN_BALANCE.";
    } catch {
      return "Ops native balance unavailable.";
    }
    return undefined;
  }
  async function provision(wallet: CustodyWallet) {
    if (wallet.address.toLowerCase() === deps.opsAddress.toLowerCase()) return;
    const reason = await readiness();
    if (reason) throw new Error(reason);
    const address = wallet.address.toLowerCase();
    const balance = await deps.getBalance(wallet.address);
    const day = new Date((deps.now ?? Date.now)()).toISOString().slice(0, 10);
    const reservation = db
      .transaction(() => {
        const pending = db
          .query<{ id: string; amount: string; day: string }, [string, string]>(
            "SELECT id, amount, day FROM chain_gas_float WHERE fingerprint = ? AND wallet = ? AND completed = 0 LIMIT 1",
          )
          .get(fingerprint, address);
        if (pending) {
          if (pending.day !== day) {
            // A delayed delivery consumes today's budget before any new funding.
            const spent = db
              .query<{ amount: string }, [string, string]>(
                "SELECT amount FROM chain_gas_float WHERE wallet = ? AND day = ?",
              )
              .all(address, day)
              .reduce((sum, row) => sum + BigInt(row.amount), 0n);
            if (spent + BigInt(pending.amount) > policy.dailyCap)
              throw new Error("CHAIN_GAS_DAILY_CAP_PER_WALLET exceeded.");
            db.query("UPDATE chain_gas_float SET day = ? WHERE id = ?").run(
              day,
              pending.id,
            );
          }
          return pending;
        }
        if (balance >= policy.lowWater) return undefined;
        const rows = db
          .query<{ amount: string }, [string, string]>(
            "SELECT amount FROM chain_gas_float WHERE wallet = ? AND day = ?",
          )
          .all(address, day);
        const amount = policy.float - balance;
        if (
          rows.reduce((sum, row) => sum + BigInt(row.amount), 0n) + amount >
          policy.dailyCap
        )
          throw new Error("CHAIN_GAS_DAILY_CAP_PER_WALLET exceeded.");
        const id = `gas:${fingerprint}:${address}:${day}:${rows.length}`;
        db.query(
          "INSERT INTO chain_gas_float (id,fingerprint,wallet,day,amount) VALUES (?,?,?,?,?)",
        ).run(id, fingerprint, address, day, amount.toString());
        return { id, amount: amount.toString() };
      })
      .immediate();
    if (!reservation) return;
    const result = await deps.executor.execute({
      operationId: reservation.id,
      walletId: "chain:ops",
      command: {
        kind: "nativeTransfer",
        to: wallet.address,
        amount: BigInt(reservation.amount),
      },
    });
    if (result.state === "finalized" || result.state === "reverted")
      db.query("UPDATE chain_gas_float SET completed = 1 WHERE id = ?").run(
        reservation.id,
      );
    if (result.state !== "finalized")
      throw new Error("Gas float delivery requires reconciliation.");
  }
  return { provision, readiness };
}
