import { PriceSource } from "@night-shares/proto/stay/v1/trip_pb";

type Usdc = { micros: bigint } | undefined;
// The parts of a StayQuote the summary reads, so tests can pass plain objects.
type QuoteLike = {
  nights: { price?: Usdc; source: PriceSource }[];
  total?: Usdc;
  fee?: Usdc;
  selection?: { rooms: number };
};

export type QuoteSummary = {
  nights: number;
  rooms: number;
  total: bigint;
  fee: bigint;
  // Average price of one room for one night, fee included.
  perNight: bigint;
  hotel: bigint;
  trader: bigint;
  recall: bigint;
};

// Totals a guest reads on the book card, split by where each night came from.
export function summarizeQuote(quote: QuoteLike): QuoteSummary {
  const nights = quote.nights.length;
  const rooms = Math.max(1, quote.selection?.rooms ?? 1);
  const total = quote.total?.micros ?? 0n;
  const bySource = (source: PriceSource) =>
    quote.nights
      .filter((n) => n.source === source)
      .reduce((sum, n) => sum + (n.price?.micros ?? 0n), 0n);
  return {
    nights,
    rooms,
    total,
    fee: quote.fee?.micros ?? 0n,
    perNight: nights ? total / BigInt(nights * rooms) : 0n,
    hotel: bySource(PriceSource.HOTEL),
    trader: bySource(PriceSource.TRADER),
    recall: bySource(PriceSource.RECALL_CAP),
  };
}
