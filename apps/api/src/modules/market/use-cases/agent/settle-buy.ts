import {
  askFillProceeds,
  type BuyResult,
  type NightState,
  toMicros,
} from "@night-shares/market-model";
import type { checkpointLedger } from "../../../../ports/agent-pass/ledger.sqlite";
import type { User } from "../../../../ports/sessions/session-store";
import { toWholeTenths } from "../../../../shared/tenths";
import type { Deps } from "../context";
import { tradeFeePayments } from "../trading/host-fees";
import { rebatePayments } from "./rebate-payments";
export function settleAgentBuy(
  { ports }: Deps,
  wallet: ReturnType<typeof checkpointLedger>,
  user: User,
  key: string,
  result: BuyResult,
  marketMaker: string,
  state: NightState,
) {
  toWholeTenths(result.filled);
  for (const fill of result.fills) toWholeTenths(fill.take);
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
  const rebates = rebatePayments(wallet, result, state, marketMaker);
  wallet.settle([...legs, ...rebates]);
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
        tenths: toWholeTenths(fill.take),
        priceMicros: toMicros(fill.price),
      });
    }
  }
}
