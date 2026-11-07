import { describe, expect, test } from "bun:test";
import { AttemptKeeper, isIdempotencyKey } from "./idempotency";

function keeper() {
  let n = 0;
  return new AttemptKeeper<string>(() => `key-${++n}`);
}

describe("idempotency keys", () => {
  test("default keys are accepted by the API pattern", () => {
    const key = new AttemptKeeper<string>().begin("buy").key;
    expect(isIdempotencyKey(key)).toBe(true);
    expect(isIdempotencyKey("bad key!")).toBe(false);
  });

  test("each settled click gets a new key", () => {
    const k = keeper();
    expect(k.begin("buy 1").key).toBe("key-1");
    k.settle(false);
    expect(k.begin("buy 1").key).toBe("key-2");
  });

  test("an unknown outcome keeps the key and the original request", () => {
    const k = keeper();
    k.begin("buy 1");
    k.settle(true);
    expect(k.unresolved).toEqual({ key: "key-1", request: "buy 1" });
    // A second click resends the first request, never a new trade.
    expect(k.begin("buy 2")).toEqual({ key: "key-1", request: "buy 1" });
    k.settle(false);
    expect(k.unresolved).toBeUndefined();
  });
});
