import { describe, expect, test } from "bun:test";
import { PriceSource } from "@night-shares/proto/stay/v1/trip_pb";
import { summarizeQuote } from "./quote";

const usdc = (whole: number) => ({ micros: BigInt(whole) * 1_000_000n });

describe("stay quote summary", () => {
  test("two rooms for two nights average per room night and split by source", () => {
    const quote = {
      selection: { rooms: 2 },
      total: usdc(1000),
      fee: usdc(20),
      nights: [
        { date: "2026-12-20", price: usdc(600), source: PriceSource.HOTEL },
        {
          date: "2026-12-21",
          price: usdc(400),
          source: PriceSource.RECALL_CAP,
        },
      ],
    };
    const s = summarizeQuote(quote);
    expect(s.nights).toBe(2);
    expect(s.perNight).toBe(250_000_000n);
    expect(s.hotel).toBe(600_000_000n);
    expect(s.recall).toBe(400_000_000n);
    expect(s.trader).toBe(0n);
  });
});
