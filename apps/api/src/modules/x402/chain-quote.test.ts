import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { book, routeBuy, toMicros } from "@night-shares/market-model";
import { RouteQuoteSchema } from "@night-shares/proto/market/v1/book_pb";
import { keccak256, stringToHex } from "viem";
import type { Ask } from "../../ports/chain-executor/chain-executor";
import type {
  ChainReader,
  ReadRequest,
} from "../../ports/chain-reader/chain-reader";
import { quoteChainBuy } from "./chain-quote";

const key = "prop_1:rt_1:2026-12-01";
const night = keccak256(stringToHex(key));
const maker = `0x${"11".repeat(20)}` as const;
const block = { number: 7n, hash: night, timestamp: 1800000000n };
const ask: Ask = {
  order: {
    night,
    maker,
    price: 10000n,
    size: 10n ** 18n,
    expiry: block.timestamp + 100n,
    nonce: 0n,
  },
  signature: "0xab",
  qty: 10n ** 18n,
};
function fixture(balance: bigint) {
  const reads: string[] = [];
  const reader: Pick<ChainReader, "head" | "read" | "assertCurrent"> = {
    head: async () => block,
    assertCurrent: async () => {},
    async read<T>(request: ReadRequest, height?: bigint) {
      expect(height).toBe(7n);
      reads.push(request.functionName);
      const values: Record<string, unknown> = {
        config: { F: 1000000n, k: 10n ** 18n, S: 10n },
        released: 2n * 10n ** 18n,
        burned: 10n ** 18n,
        balanceOf: balance,
      };
      return { block, value: values[request.functionName] as T };
    },
  };
  return {
    deps: { mode: "chain" as const, reader, signedAsks: async () => [ask] },
    reads,
  };
}
test("chain quote skips asks whose maker lacks on chain balance", async () => {
  const { deps, reads } = fixture(0n);
  const result = await quoteChainBuy(deps, key, 3);
  const expected = routeBuy(book({ F: 1, k: 1, S: 10, q: 3, levels: 3 }), 0.3);
  expect(result).toEqual({
    total: toMicros(expected.gross) + toMicros(expected.fee),
    fills: 3,
    asks: [],
  });
  expect(reads).toContain("released");
  expect(reads).toContain("burned");
});
test("chain quote selects affordable signed asks and limits quantities to fills", async () => {
  const { deps } = fixture(10n ** 18n);
  const result = await quoteChainBuy(deps, key, 3);
  expect(result.total).toBe(3039n);
  expect(result.asks).toEqual([{ ...ask, qty: 3n * 10n ** 17n }]);
});
test("chain quote does not spend the same maker balance twice", async () => {
  const { deps } = fixture(2n * 10n ** 17n);
  deps.signedAsks = async () => [
    ask,
    { ...ask, order: { ...ask.order, nonce: 1n } },
  ];
  const result = await quoteChainBuy(deps, key, 3);
  expect(result.asks.reduce((sum, a) => sum + a.qty, 0n)).toBe(2n * 10n ** 17n);
  expect(result.fills).toBe(3);
});
test("mock quote uses the existing QuoteBuy result", async () => {
  const result = await quoteChainBuy(
    {
      mode: "mock",
      quoteBuy: (nightKey, tenths) => {
        expect(nightKey).toBe(key);
        expect(tenths).toBe(3);
        return create(RouteQuoteSchema, {
          total: { micros: 100n },
          filled: { tenths: 3 },
        });
      },
    },
    key,
    3,
  );
  expect(result).toEqual({ total: 100n, fills: 3, asks: [] });
});
