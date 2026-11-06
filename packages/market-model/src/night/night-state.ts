import { PRESETS } from "../constants";
import { capOf, clampFair, floorFromRate, price } from "../curve";
import { diffDays, parseDate } from "../dates";
import { hash } from "../random/hash";
import { rng } from "../random/rng";
import { nightPrice, type RateProperty } from "./usual-rate";

export interface NightProperty extends RateProperty {
  rooms: number;
  roomTypes: readonly { rateMultiplier: number }[];
}
export interface NightStateInput {
  property: NightProperty;
  roomIndex: number;
  date: string;
  today: string;
}
export type NightState = ReturnType<typeof nightState>;

export function nightState({
  property: p,
  roomIndex: roomIdx,
  date,
  today,
}: NightStateInput) {
  const d = parseDate(date);
  const rt = p.roomTypes[roomIdx] || p.roomTypes[0];
  if (!rt)
    throw new TypeError("Cannot read properties of undefined (reading 'm')");
  const usualRate = Math.round(nightPrice(p, date) * rt.rateMultiplier);
  // Split rooms exactly across room types; earlier types take the remainder.
  const types = p.roomTypes.length;
  const S = Math.max(
    1,
    Math.floor(p.rooms / types) + (roomIdx < p.rooms % types ? 1 : 0),
  );
  const r = rng(hash(`v2${p.id}${roomIdx}${date}`));
  const dow = d.getUTCDay(),
    m = d.getUTCMonth(),
    dd = d.getUTCDate();
  const peak = (m === 11 && dd >= 20) || (m === 0 && dd <= 2);
  const preset = peak ? "peak" : dow === 5 || dow === 6 ? "normal" : "calm";
  const k = PRESETS[preset],
    F = floorFromRate(usualRate);
  const daysOut = Math.max(0, diffDays(today, date));
  // Heat is clamped to [0, 1] so inventory never goes negative.
  const heat = Math.max(
    0,
    Math.min(1, (peak ? 0.75 : 0.35) + r() * 0.35 - daysOut / 400),
  );
  const q = Math.min(S - 0.1, Math.round(heat * S * 10) / 10);
  const booked = Math.min(q, Math.round(q * (0.4 + r() * 0.3) * 10) / 10);
  const held = Math.round((q - booked) * 10) / 10;
  const pstar = clampFair(price(F, k, S, q) * (0.95 + r() * 0.15), usualRate);
  const traderAsks =
    held > 0
      ? [
          {
            price: Math.round(pstar * (1.04 + r() * 0.2)),
            size: Math.min(held, 0.5),
            who: "mm-bot",
          },
        ]
      : [];
  const hoursLeft = daysOut * 24 + 14;
  return {
    usualRate,
    S,
    F,
    k,
    preset,
    peak,
    q,
    booked,
    held,
    pstar,
    traderAsks,
    hoursLeft,
    cap: capOf(S),
  };
}
