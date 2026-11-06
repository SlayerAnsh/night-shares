import { describe, expect, test } from "bun:test";
import { compactPrice, pickNight, priceTiers } from "./calendar";

describe("stay range calendar", () => {
  test("guest picks check in then check out", () => {
    const first = pickNight({ checkIn: "", checkOut: "" }, "2026-12-20");
    expect(first).toEqual({ checkIn: "2026-12-20", checkOut: "" });
    expect(pickNight(first, "2026-12-23")).toEqual({
      checkIn: "2026-12-20",
      checkOut: "2026-12-23",
    });
  });

  test("a click before check in or after a full stay starts over", () => {
    expect(
      pickNight({ checkIn: "2026-12-20", checkOut: "" }, "2026-12-18"),
    ).toEqual({ checkIn: "2026-12-18", checkOut: "" });
    expect(
      pickNight(
        { checkIn: "2026-12-20", checkOut: "2026-12-23" },
        "2026-12-25",
      ),
    ).toEqual({ checkIn: "2026-12-25", checkOut: "" });
  });

  test("cheapest nights are flagged low and the top quarter high", () => {
    const prices = [
      100n,
      200n,
      300n,
      400n,
      500n,
      600n,
      700n,
      800n,
      900n,
      1000n,
    ];
    const tier = priceTiers(prices);
    expect(tier(100n)).toBe("lo");
    expect(tier(500n)).toBe("mid");
    expect(tier(900n)).toBe("hi");
  });

  test("calendar prices are whole USDC, thousands shortened", () => {
    expect(compactPrice(718_943_123n)).toBe("718");
    expect(compactPrice(1_240_000_000n)).toBe("1.2k");
  });
});
