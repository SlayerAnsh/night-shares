import { create } from "@bufbuild/protobuf";
import {
  StayQuoteSchema,
  type StaySelection,
} from "@night-shares/proto/stay/v1/trip_pb";
import type { Ports } from "../../../../container/ports";
import { chainStatus } from "../../../../ports/chain-status/chain-status";
import { quoteNight } from "../../pricing/quote-night";
import { selection } from "../../pricing/selection";
import type { StayRepo } from "../../repo/stay-repo";
export function createQuoteStay(ports: Ports, repo: StayRepo) {
  return (input: StaySelection | undefined) => {
    const { value, dates } = selection(ports, input);
    const nights = dates.map((date) =>
      quoteNight(ports, value.propertyId, value.roomTypeId, date, value.rooms),
    );
    const quote = create(StayQuoteSchema, {
      onChain: ports.chainExecutor?.mode === "fork",
      tradingPaused: dates.some((date) =>
        chainStatus(ports).isPaused(
          `${value.propertyId}:${value.roomTypeId}:${date}`,
        ),
      ),
      id: ports.ids.next("quote"),
      selection: value,
      nights,
      total: { micros: nights.reduce((sum, n) => sum + n.price.micros, 0n) },
      fee: { micros: nights.reduce((sum, n) => sum + n.fee, 0n) },
      usualRate: {
        micros: nights.reduce((sum, n) => sum + n.usualRate.micros, 0n),
      },
    });
    repo.quotes.set(quote.id, structuredClone(quote));
    return quote;
  };
}
