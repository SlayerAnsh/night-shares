import type { Address, Hex } from "viem";
import { deserialize } from "../../../ports/chain-executor/chain-executor";
import type { Deps } from "../use-cases/context";
import { chainMarket } from "./runtime";
/** Replays canonical receipt/log facts. Unknown external acquisition cost stays unknown. */
export function chainAccounting(
  deps: Deps,
  night: Hex,
  token: Address,
  wallet: Address,
) {
  const { reader, deployment } = chainMarket(deps.ports);
  const rows = deps.ports.db
    .query<
      { tx_hash: string; address: string; event: string; args: string },
      [string]
    >(
      "SELECT tx_hash,address,event,args FROM chain_events WHERE fingerprint = ? ORDER BY block_number,log_index",
    )
    .all(reader.fingerprint);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = groups.get(row.tx_hash) ?? [];
    group.push(row);
    groups.set(row.tx_hash, group);
  }
  let balance = 0n,
    cost = 0n,
    realised = 0n,
    known = true,
    complete = true;
  const address = wallet.toLowerCase();
  for (const events of groups.values()) {
    const cutoff = events.some(
      (e) =>
        e.event === "CutoffReleased" &&
        deserialize<{ night: string }>(e.args).night === night,
    );
    let incoming = 0n,
      outgoing = 0n,
      bought = 0n,
      paid = 0n,
      sold = 0n,
      proceeds = 0n;
    for (const event of events) {
      const a = deserialize<Record<string, bigint | string>>(event.args);
      const from = String(a.from).toLowerCase(),
        to = String(a.to).toLowerCase();
      if (
        event.event === "Transfer" &&
        event.address.toLowerCase() === token.toLowerCase()
      ) {
        if (to === address) incoming += BigInt(a.amount ?? a.value ?? 0);
        if (from === address && !cutoff)
          outgoing += BigInt(a.amount ?? a.value ?? 0);
      }
      if (a.night !== night) continue;
      if (
        event.event === "Trade" &&
        [deployment.TradeRouter, deployment.NightHook].some(
          (c) => c.toLowerCase() === event.address.toLowerCase(),
        )
      ) {
        const qty = BigInt(a.qty ?? 0),
          notional = BigInt(a.notional ?? 0),
          fee = BigInt(a.fee ?? 0);
        if (String(a.taker).toLowerCase() === address) {
          if (BigInt(a.side ?? 0) === 0n) {
            bought += qty;
            paid += notional + fee;
          } else {
            sold += qty;
            proceeds += notional - fee;
          }
        }
        if (String(a.maker).toLowerCase() === address) {
          sold += qty;
          proceeds += notional + BigInt(a.makerRebate ?? 0);
        }
      }
      if (
        event.event === "Recalled" &&
        String(a.holder).toLowerCase() === address
      ) {
        sold += BigInt(a.qty ?? 0);
        proceeds += BigInt(a.paidToHolder ?? 0);
      }
      if (
        event.event === "CutoffClaimed" &&
        String(a.holder).toLowerCase() === address
      ) {
        sold += balance;
        outgoing += balance;
        proceeds += BigInt(a.amount ?? 0);
      }
    }
    if (!incoming && !outgoing && !sold && !bought) continue;
    if (incoming !== bought) known = false;
    const available = balance + incoming;
    cost += paid;
    const removed = outgoing > available ? available : outgoing;
    const removedCost = available ? (cost * removed) / available : 0n;
    if (!known && sold) complete = false;
    if (known && sold)
      realised += proceeds - (available ? (cost * sold) / available : 0n);
    cost -= removedCost;
    balance = available - removed;
    if (balance === 0n) {
      cost = 0n;
      known = true;
    }
  }
  return { balance, cost, realised, known, complete };
}
