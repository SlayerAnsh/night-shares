import { describe, expect, test } from "bun:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { isOneNightRejection, overOneNight, staysOnChain } from "./on-chain";

const rejected = new ConnectError(
  "On-chain bookings support exactly 1 room for 1 night. Choose a single room and night.",
  Code.InvalidArgument,
);

describe("on-chain stays", () => {
  test("a quote flagged on chain says so", () => {
    expect(staysOnChain([{ data: { quote: { onChain: true } } }])).toBe(true);
  });

  test("a 1 room x 1 night rejection says so too", () => {
    expect(isOneNightRejection(rejected)).toBe(true);
    expect(staysOnChain([{ error: rejected }])).toBe(true);
  });

  test("mock quotes and other errors say nothing", () => {
    expect(
      staysOnChain([
        { data: { quote: { onChain: false } } },
        { data: { property: {} } },
        { error: new ConnectError("Property not found.", Code.NotFound) },
      ]),
    ).toBe(false);
    expect(isOneNightRejection(undefined)).toBe(false);
  });

  test("more than one night or room is over the limit", () => {
    expect(overOneNight(1, 1)).toBe(false);
    expect(overOneNight(2, 1)).toBe(true);
    expect(overOneNight(1, 2)).toBe(true);
  });
});
