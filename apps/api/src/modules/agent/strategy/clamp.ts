import { DomainError } from "../../../shared/errors/domain-error";
import { type AgentStrategy, parseStrategy } from "./schema";

type Night = AgentStrategy["markets"]["nights"][number];
const key = (n: Night) => `${n.propertyId}:${n.roomTypeId}:${n.date}`;

export function clampStrategy(
  s: AgentStrategy,
  limits: { allowedNights: string[]; capTenths: number; perOrderCap: bigint },
): AgentStrategy {
  const result = parseStrategy(s);
  if (
    !Number.isSafeInteger(limits.capTenths) ||
    limits.capTenths < 1 ||
    typeof limits.perOrderCap !== "bigint" ||
    limits.perOrderCap < 0n
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Strategy limits must have a positive integer cap and nonnegative micro USDC.",
    );
  }
  if (limits.allowedNights.length) {
    const allowed = limits.allowedNights.map((value) => {
      const parts = value.split(":");
      const [propertyId, roomTypeId, date] = parts;
      if (parts.length !== 3 || !propertyId || !roomTypeId || !date) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Allowed nights must be property:room:date keys.",
        );
      }
      return { propertyId, roomTypeId, date };
    });
    const original = result.markets.nights;
    const intersection = original.length
      ? original.filter((n) => limits.allowedNights.includes(key(n)))
      : allowed;
    if (intersection.length) result.markets.nights = intersection;
    else {
      // Empty nights means all markets, so retain and disable a disjoint selection.
      for (const n of original) {
        if (
          !result.markets.disabled.some((disabled) => key(disabled) === key(n))
        )
          result.markets.disabled.push(n);
      }
    }
  }
  result.sizing.maxPerNight = Math.min(
    result.sizing.maxPerNight,
    limits.capTenths,
  );
  result.sizing.maxPerTrade = Math.min(
    result.sizing.maxPerTrade,
    result.sizing.maxPerNight,
  );
  // Strategy has no price or money field; the executor enforces perOrderCap on quoted totals.
  return result;
}
