import {
  type BuyResult,
  makerRebate,
  type NightState,
  price,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import {
  type SettlementLeg,
  SYSTEM_ADDRESSES,
  type WalletProvider,
} from "../../../../ports/wallet-provider/wallet-provider";

// Advance the curve only for pool fills, preserving the price at each ask fill.
export async function rebatePayments(
  wallet: WalletProvider,
  result: BuyResult,
  state: NightState,
  marketMaker: string,
): Promise<(SettlementLeg & { tenths: number })[]> {
  if (!result.fills.some((fill) => fill.src === "trader")) return [];
  let balance = await wallet.balance(SYSTEM_ADDRESSES.rebatePool);
  let q = state.q;
  const legs: (SettlementLeg & { tenths: number })[] = [];
  for (const fill of result.fills) {
    if (fill.src === "pool") q += fill.take;
    if (fill.src !== "trader") continue;
    const requested = toMicros(
      makerRebate({
        askPrice: fill.price,
        poolPrice: price(state.F, state.k, state.S, q),
        size: fill.take,
      }),
    );
    // biome-ignore lint/complexity/useMathMinMax: Math.min cannot accept bigint.
    const amount = requested < balance ? requested : balance;
    if (amount <= 0n) continue;
    balance -= amount;
    legs.push({
      from: SYSTEM_ADDRESSES.rebatePool,
      to: fill.who === "mm-bot" ? marketMaker : (fill.who ?? marketMaker),
      amount,
      memo: "rebate:maker",
      tenths: toTenths(fill.take),
    });
  }
  return legs;
}
