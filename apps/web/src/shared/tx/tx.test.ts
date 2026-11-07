import { describe, expect, test } from "bun:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { explorerTxUrl, isTxHash, shortHash, txFailure, txHashOf } from "./tx";

const HASH = `0x${"ab".repeat(32)}`;
const fail = (message: string, code = Code.FailedPrecondition) =>
  txFailure(new ConnectError(message, code));

describe("transaction hashes", () => {
  test("only a 32 byte hex value counts as a hash", () => {
    expect(isTxHash(HASH)).toBe(true);
    expect(isTxHash("trade_1")).toBe(false);
    expect(isTxHash("")).toBe(false);
  });

  test("a hash shortens to its head and tail", () => {
    expect(shortHash(HASH)).toBe("0xabab…abab");
    expect(shortHash("0x12")).toBe("0x12");
  });

  test("the hash is read from the result, and mock results have none", () => {
    expect(txHashOf({ chainTransactionHash: HASH })).toBe(HASH);
    expect(txHashOf({ transactionHash: HASH })).toBe(HASH);
    expect(txHashOf({ chainTransactionHash: "" })).toBeUndefined();
    expect(txHashOf({ id: "trade_1" })).toBeUndefined();
    expect(txHashOf(undefined)).toBeUndefined();
  });

  test("a link exists only when the API names an explorer", () => {
    expect(explorerTxUrl(undefined, HASH)).toBeUndefined();
    expect(explorerTxUrl("", HASH)).toBeUndefined();
    expect(explorerTxUrl("https://scan.arc/", HASH)).toBe(
      `https://scan.arc/tx/${HASH}`,
    );
    expect(explorerTxUrl(`https://scan.arc/tx/${HASH}`, HASH)).toBe(
      `https://scan.arc/tx/${HASH}`,
    );
    expect(explorerTxUrl("https://scan.arc/tx/", HASH)).toBe(
      `https://scan.arc/tx/${HASH}`,
    );
    expect(explorerTxUrl("javascript:alert(1)", HASH)).toBeUndefined();
  });
});

describe("failed writes", () => {
  test("a moved price reads as slippage and is settled", () => {
    const f = fail("Price moved.");
    expect(f.kind).toBe("slippage");
    expect(f.message).toContain("slippage limit");
    expect(f.unknownOutcome).toBe(false);
  });

  test("a pending receipt keeps the attempt for a safe retry", () => {
    const f = fail("Chain operation trade_7 is pending reconciliation.");
    expect(f.kind).toBe("confirming");
    expect(f.unknownOutcome).toBe(true);
  });

  test("API rules map to plain titles", () => {
    expect(fail("Trading is paused.").kind).toBe("paused");
    expect(fail("Per-human cap exceeded.").kind).toBe("cap");
    expect(fail("Chain transaction reverted.").kind).toBe("reverted");
    expect(fail("Insufficient USDC balance.").kind).toBe("balance");
    expect(fail("Not enough trader liquidity.").kind).toBe("liquidity");
    expect(
      fail("Another wallet operation is pending reconciliation.").kind,
    ).toBe("confirming");
    expect(fail("Another cancellation is pending.").kind).toBe("confirming");
    expect(
      fail(
        "On-chain bookings support exactly 1 room for 1 night. Choose a single room and night.",
        Code.InvalidArgument,
      ).kind,
    ).toBe("one-night");
  });

  test("a dropped connection may have landed, a refusal has not", () => {
    expect(txFailure(new TypeError("Failed to fetch")).unknownOutcome).toBe(
      true,
    );
    expect(fail("Not open.", Code.PermissionDenied).unknownOutcome).toBe(false);
  });

  test("prefixed strings are read like Connect errors", () => {
    expect(txFailure("[failed_precondition] Price moved.").kind).toBe(
      "slippage",
    );
  });

  test("no copy shows a raw code", () => {
    for (const f of [fail("Price moved."), fail("x", Code.Internal)])
      expect(`${f.title} ${f.message}`).not.toMatch(
        /failed_precondition|internal\]/,
      );
  });
});

test("typed reasons override contradictory messages", async () => {
  const { ErrorInfoSchema } = await import(
    "@night-shares/proto/common/v1/error_pb"
  );
  const kinds = {
    SLIPPAGE: "slippage",
    PENDING_RECONCILIATION: "confirming",
    CANCEL_PENDING: "confirming",
    REVERTED: "reverted",
    TRADING_PAUSED: "paused",
    CAP_EXCEEDED: "cap",
    LIQUIDITY: "liquidity",
    INSUFFICIENT_USDC: "balance",
    ONE_ROOM_ONE_NIGHT: "one-night",
  } as const;
  for (const [reason, kind] of Object.entries(kinds)) {
    const error = new ConnectError(
      "Price moved.",
      Code.FailedPrecondition,
      undefined,
      [
        {
          desc: ErrorInfoSchema,
          value: { reason, domain: "night-shares" },
        },
      ],
    );
    expect(txFailure(error).kind).toBe(kind);
    expect(txFailure(error).unknownOutcome).toBe(kind === "confirming");
  }
  expect(
    txFailure(
      new ConnectError("Price moved.", Code.FailedPrecondition, undefined, [
        { desc: ErrorInfoSchema, value: { reason: "FUTURE_REASON" } },
      ]),
    ).kind,
  ).toBe("slippage");
});
