import { expect, test } from "bun:test";
import { book, lateFee, toMicros } from "@night-shares/market-model";
import { fixture } from "../../testing/fixture";
import { getBook } from "./get-book";

test("book exposes pool, trader, guest tranche, recall and late fee", async () => {
  const d = await fixture(),
    result = getBook(d, d.key);
  const state = d.ports.inventory.get(d.key).state;
  expect(result.recallCap.micros).toBe(toMicros(book(state).recall));
  expect(result.lateFeeBps).toBe(Math.round(lateFee(14) * 10000));
  expect(result.asks.some((a) => a.guestOnly)).toBe(true);
  expect(result.asks.some((a) => a.askId.endsWith("|mm-bot"))).toBe(true);
});
