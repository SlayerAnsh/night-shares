import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  FEE,
  hash,
  price,
  REFUND_AT_FAIR,
  rng,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import {
  NightCardSchema,
  NightStatsSchema,
  Risk,
} from "@night-shares/proto/market/v1/analytics_pb";
import type { Ports } from "../../../../container/ports";
import { toProto } from "../../../../shared/night-key";
import type { NightRecord } from "../../../inventory/inventory-repo";
import { bookOf, hoursLeft, releaseAt } from "../../use-cases/context";
import { history } from "./history";
import { track } from "./track";
export function card(ports: Ports, record: NightRecord) {
  const property = ports.catalog.get(record.propertyId);
  if (!property) throw new Error("Inventory property is missing.");
  const state = record.state,
    bk = bookOf(ports, record),
    ps = state.pstar;
  const current = bk.asks.find((a) => !a.guestOnly)?.price ?? ps;
  const hist = history(property, record),
    dl = Math.max(1, hoursLeft(ports, record) / 24);
  const trend = Math.max(
    -0.2,
    Math.min(0.2, (ps / (hist.fair[0] ?? ps) - 1) * Math.min(1, dl / 30) * 0.5),
  );
  const date = new Date(`${record.date}T00:00:00Z`),
    weekend = [5, 6].includes(date.getUTCDay());
  const random = rng(
    hash(`st${property.modelId}${weekend}${date.getUTCMonth()}`),
  )();
  const sell = Math.min(
    0.97,
    Math.max(
      0.3,
      track(property).bookedBps / 10000 +
        (weekend ? 0.07 : -0.03) +
        (state.peak ? 0.1 : 0) +
        (random - 0.5) * 0.08,
    ),
  );
  const qExp = Math.min(state.S - 0.1, state.q + sell * (state.S - state.q));
  const exit =
    sell *
      (0.5 * ps * (1 + trend) + 0.5 * price(state.F, state.k, state.S, qExp)) +
    (1 - sell) * (0.5 * ps * 0.9 * (1 - FEE) + 0.5 * REFUND_AT_FAIR * ps);
  const ret = (exit * (1 - FEE)) / (current * (1 + FEE)) - 1;
  const apy = Math.max(1e-4, 1 + ret) ** (365 / dl) - 1;
  const changes = hist.market
    .slice(1)
    .map((v, i) => v / (hist.market[i] ?? v) - 1);
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const vol =
    Math.sqrt(
      changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length,
    ) * Math.sqrt(30);
  const buy = bk.asks
    .filter((a) => !a.guestOnly && Math.abs(a.price / ps - 1) <= 0.05)
    .reduce((a, b) => a + b.size, 0);
  const sellLiq = bk.bids
    .filter((b) => Math.abs(b.price / ps - 1) <= 0.05)
    .reduce((a, b) => a + b.size, 0);
  const score =
    vol * 1.5 +
    (1 - sell) * 1.2 +
    Math.max(0, current / ps - 1) * 2 +
    (buy + sellLiq < 0.3 ? 0.15 : 0);
  return {
    card: create(NightCardSchema, {
      night: toProto(record.key),
      propertyName: property.name,
      roomTypeName: property.roomTypes.find((r) => r.id === record.roomTypeId)
        ?.name,
      city: property.city,
      price: { micros: toMicros(current) },
      fairPrice: { micros: toMicros(ps) },
      estimatedReturnBps: bps(ret),
      risk: score < 0.42 ? Risk.LOW : score < 0.6 ? Risk.MEDIUM : Risk.HIGH,
      releaseAt: timestampFromMs(releaseAt(record)),
      changeBps: bps(
        (hist.market[30] ?? current) / (hist.market[29] ?? current) - 1,
      ),
    }),
    stats: create(NightStatsSchema, {
      annualizedReturnBps: bps(apy),
      volatilityBps: bps(vol),
      sellThroughBps: bps(sell),
      expectedExit: { micros: toMicros(exit) },
      worstRefund: { micros: toMicros(REFUND_AT_FAIR * ps) },
      buyLiquidity: { tenths: toTenths(buy) },
      sellLiquidity: { tenths: toTenths(sellLiq) },
    }),
    hist,
    property,
  };
}
function bps(value: number) {
  return Math.max(-2147483648, Math.min(2147483647, Math.round(value * 10000)));
}
