import { describe, expect, test } from "bun:test";
import {
  fairDelta,
  fairText,
  fairTone,
  forecastReturn,
  median,
  releaseLong,
  releaseShort,
  shortDate,
  signedPercent,
  signedUsd,
  tone,
  usd,
  usdCompact,
  weekdayDate,
} from "./display";

describe("trade display formatting", () => {
  test("prices round to whole dollars unless asked for cents", () => {
    expect(usd(412_400_000n)).toBe("$412");
    expect(usd(1_234_560_000n, 2)).toBe("$1,234.56");
    expect(usd(-12_000_000n)).toBe("-$12");
    expect(usd(undefined)).toBe("n/a");
    expect(usdCompact(48_200_000_000n)).toBe("$48.2k");
  });
  test("profit and loss carries a sign and hides sub dollar noise", () => {
    expect(signedUsd(12_000_000n)).toBe("+$12");
    expect(signedUsd(-12_000_000n)).toBe("−$12");
    expect(signedUsd(300_000n)).toBe("$0");
  });
  test("percent changes carry a sign except at zero", () => {
    expect(signedPercent(125)).toBe("+1.3%");
    expect(signedPercent(-840, 0)).toBe("−8%");
    expect(signedPercent(0)).toBe("0.0%");
    expect(tone(-3)).toBe("neg");
    expect(tone(0n)).toBe("flat");
  });
  test("an ask within two percent of fair reads as near", () => {
    expect(fairText(fairDelta(101n, 100n))).toBe("Near");
    expect(fairText(fairDelta(90n, 100n))).toBe("−10%");
    expect(fairTone(fairDelta(90n, 100n))).toBe("pos");
    expect(fairTone(fairDelta(110n, 100n))).toBe("neg");
    expect(fairDelta(undefined, 100n)).toBeNull();
  });
  test("nights read as calendar dates in the property calendar", () => {
    expect(shortDate("2026-12-31")).toBe("Dec 31");
    expect(weekdayDate("2026-11-07")).toBe("Sat, Nov 7");
  });
  test("release countdowns shorten to days or hours", () => {
    expect(releaseShort(80)).toBe("3d");
    expect(releaseShort(5.5)).toBe("5h");
    expect(releaseLong(50)).toBe("2d 2h");
    expect(releaseLong(-1)).toBe("Released");
  });
  test("median handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

test("sub-dollar prices retain four decimals and missing forecasts stay unavailable", () => {
  expect(usd(10290n)).toBe("$0.0103");
  expect(usd(10290n, 2)).toBe("$0.0103");
  expect(usd(100n)).toBe("$0.0001");
  expect(usd(-10290n)).toBe("-$0.0103");
  expect(signedPercent(undefined)).toBe("n/a");
  expect(signedPercent(2147483647)).toBe("n/a");
});

test("a zero proto default does not invent a chain forecast", () => {
  expect(
    forecastReturn({ price: { micros: 10290n }, estimatedReturnBps: 0 }),
  ).toBeUndefined();
  expect(
    forecastReturn({
      price: { micros: 9999n },
      fairPrice: { micros: 1000000n },
      estimatedReturnBps: 9000000,
    }),
  ).toBeUndefined();
  expect(
    forecastReturn({
      price: { micros: 1000000n },
      fairPrice: { micros: 1000000n },
      estimatedReturnBps: 0,
    }),
  ).toBe(0);
});
