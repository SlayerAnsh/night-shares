import type {
  AgentEntry,
  AgentExit,
  AgentMarkets,
} from "@night-shares/proto/agent/v1/strategy_pb";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { DomainError } from "../../../shared/errors/domain-error";

type Plain<T> = Omit<T, "$typeName" | "$unknown">;
type Night = Plain<NightKey>;
export type AgentStrategy = {
  version: 1;
  markets: Omit<Plain<AgentMarkets>, "nights" | "disabled"> & {
    nights: Night[];
    disabled: Night[];
  };
  entry: Plain<AgentEntry>;
  exit: Plain<AgentExit>;
  sizing: { maxPerNight: number; maxPerTrade: number };
};
function invalid(field: string): never {
  throw new DomainError("INVALID_ARGUMENT", `Invalid ${field}.`);
}
function object(
  value: unknown,
  fields: string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid(path);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !fields.includes(key)))
    return invalid(path);
  if (fields.some((key) => !Object.hasOwn(record, key))) return invalid(path);
  return record;
}
function integer(
  value: unknown,
  min: number,
  max: number,
  path: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    return invalid(path);
  return value;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string") return invalid(path);
  return value;
}
function array<T>(
  value: unknown,
  parse: (item: unknown) => T,
  path: string,
): T[] {
  if (!Array.isArray(value)) return invalid(path);
  return Array.from(value, parse);
}
function night(value: unknown): Night {
  const n = object(value, ["propertyId", "roomTypeId", "date"], "night");
  return {
    propertyId: string(n.propertyId, "propertyId"),
    roomTypeId: string(n.roomTypeId, "roomTypeId"),
    date: string(n.date, "date"),
  };
}
function markets(value: unknown): AgentStrategy["markets"] {
  const m = object(
    value,
    ["propertyIds", "nights", "dateFrom", "dateTo", "weekdays", "disabled"],
    "markets",
  );
  return {
    propertyIds: array(
      m.propertyIds,
      (v) => string(v, "propertyIds"),
      "propertyIds",
    ),
    nights: array(m.nights, night, "nights"),
    dateFrom: string(m.dateFrom, "dateFrom"),
    dateTo: string(m.dateTo, "dateTo"),
    weekdays: array(
      m.weekdays,
      (v) => integer(v, 0, 6, "weekdays"),
      "weekdays",
    ),
    disabled: array(m.disabled, night, "disabled"),
  };
}
function rules<K extends string>(
  value: unknown,
  fields: readonly K[],
  path: string,
): Record<K, number> {
  const record = object(value, [...fields], path);
  return Object.fromEntries(
    fields.map((key) => [
      key,
      integer(
        record[key],
        0,
        key.endsWith("Bps") ? 10000 : 2160,
        `${path}.${key}`,
      ),
    ]),
  ) as Record<K, number>;
}
export function parseStrategy(value: unknown): AgentStrategy {
  const s = object(
    value,
    ["version", "markets", "entry", "exit", "sizing"],
    "strategy",
  );
  integer(s.version, 1, 1, "version");
  const sizing = object(s.sizing, ["maxPerNight", "maxPerTrade"], "sizing");
  const maxPerNight = integer(sizing.maxPerNight, 1, 2147483647, "maxPerNight");
  const maxPerTrade = integer(
    sizing.maxPerTrade,
    1,
    maxPerNight,
    "maxPerTrade",
  );
  return {
    version: 1,
    markets: markets(s.markets),
    entry: rules(
      s.entry,
      [
        "maxPriceVsFairBps",
        "minHoursToRelease",
        "maxHoursToRelease",
        "momentumLookbackHours",
        "momentumMinRiseBps",
      ],
      "entry",
    ),
    exit: rules(
      s.exit,
      ["takeProfitBps", "stopLossBps", "exitHoursBeforeRelease"],
      "exit",
    ),
    sizing: { maxPerNight, maxPerTrade },
  };
}
