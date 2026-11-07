import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { formatNight } from "../../../shared/format";
import { usd } from "./display";
export function parseNightKey(key: string) {
  const [propertyId, roomTypeId, date, extra] = key.split(":");
  if (!propertyId || !roomTypeId || !date || extra !== undefined) return null;
  try {
    formatNight(date);
  } catch {
    return null;
  }
  return { propertyId, roomTypeId, date };
}
export function nightHref(
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">,
) {
  return `/trade/${encodeURIComponent(`${night.propertyId}:${night.roomTypeId}:${night.date}`)}`;
}
export function parseMicros(value: string): bigint | null {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const micros = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  return micros > 0n && micros <= 9223372036854775807n ? micros : null;
}
export function parseTenths(value: string): number | null {
  if (!/^\d+(\.\d)?$/.test(value)) return null;
  const result = Math.round(Number(value) * 10);
  return Number.isSafeInteger(result) && result > 0 && result <= 2147483647
    ? result
    : null;
}
export function daysOut(date: string, now: number) {
  return Math.ceil((Date.parse(`${date}T00:00:00Z`) - now) / 86400000);
}
export const money = (value?: { micros: bigint }) =>
  value ? usd(value.micros, 2) : "Unavailable";
export const percent = (bps: number | undefined) =>
  bps === undefined || !Number.isFinite(bps) || Math.abs(bps) > 1000000
    ? "n/a"
    : `${(bps / 100).toFixed(2)}%`;
export const riskName = (risk: number) =>
  ["Unknown", "Low", "Medium", "High"][risk] ?? "Unknown";
export const sourceName = (source: number) =>
  ["Unknown", "Pool", "Trader", "Recall", "Sell-back"][source] ?? "Unknown";
