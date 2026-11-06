import {
  askFillProceeds,
  type BuyResult,
  type NightState,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import type { User } from "../../../../ports/sessions/session-store";
import type { Deps } from "../context";
import { tradeFeePayments } from "./host-fees";
import { rebatePayments } from "./rebate-payments";
export async function settleBuy(
  { ports }: Deps,
  user: User,
  key: string,
  result: BuyResult,
  marketMaker: string,
  state: NightState,
) {
  const legs: Parameters<typeof ports.walletProvider.settle>[0] = [];
  const transfer = (from: string, to: string, amount: bigint, memo: string) => {
    if (amount > 0n) legs.push({ from, to, amount, memo });
  };
  let remaining = toMicros(result.gross);
  for (const [index, fill] of result.fills.entries()) {
    const gross =
      index === result.fills.length - 1
        ? remaining
        : toMicros(askFillProceeds(fill.price, fill.take).gross);
    remaining -= gross;
    if (fill.src === "trader") {
      const fee = toMicros(fill.sellerFee ?? 0);
      transfer(
        user.walletAddress,
        fill.who === "mm-bot" ? marketMaker : (fill.who ?? marketMaker),
        gross - fee,
        "ask fill",
      );
      for (const payment of tradeFeePayments(
        ports,
        key.split(":")[0] ?? "",
        fill.who ?? marketMaker,
        gross,
        fee,
      ))
        transfer(user.walletAddress, payment.to, payment.amount, "seller fee");
    } else transfer(user.walletAddress, "pool", gross, "market buy");
  }
  for (const payment of tradeFeePayments(
    ports,
    key.split(":")[0] ?? "",
    user,
    toMicros(result.gross),
    toMicros(result.fee),
  ))
    transfer(user.walletAddress, payment.to, payment.amount, "buyer fee");
  const rebates = await rebatePayments(
    ports.walletProvider,
    result,
    state,
    marketMaker,
  );
  await ports.walletProvider.settle([...legs, ...rebates]);
  for (const rebate of rebates) {
    ports.activity.append({
      nightKey: key,
      propertyId: key.split(":")[0] ?? "",
      kind: "maker_rebate",
      actor: "trader",
      priceMicros: rebate.amount,
      tenths: rebate.tenths,
    });
  }
  for (const fill of result.fills) {
    if (fill.src === "trader") {
      ports.activity.append({
        nightKey: key,
        propertyId: key.split(":")[0] ?? "",
        kind: "ask_filled",
        actor: "trader",
        tenths: toTenths(fill.take),
        priceMicros: toMicros(fill.price),
      });
    }
  }
}
