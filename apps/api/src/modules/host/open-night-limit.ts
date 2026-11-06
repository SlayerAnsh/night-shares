import type { Ports } from "../../container/ports";
import { DomainError } from "../../shared/errors/domain-error";
import { MAX_OPEN_NIGHTS } from "./chain-limits";
export function assertOpenNightLimit(ports: Ports, keys: string[]) {
  // Lazy demo inventory is not a factory opening. Include in-flight host pushes
  // so concurrent OpenNights calls cannot each reserve the last available slot.
  const rows = ports.db
    .query<{ night_key: string }, []>(
      `SELECT night_key FROM host_pool_positions
     UNION SELECT night_key FROM market_settlements WHERE id LIKE 'hotel_push_%'`,
    )
    .all();
  const open = new Set(
    rows
      .filter(
        (r) =>
          !ports.activity.list({
            nightKey: r.night_key,
            kinds: ["night_released"],
            limit: 1,
          }).length,
      )
      .map((r) => r.night_key),
  );
  for (const key of keys) open.add(key);
  if (open.size > MAX_OPEN_NIGHTS)
    throw new DomainError(
      "INVALID_ARGUMENT",
      `Open nights ${open.size} is above the ${MAX_OPEN_NIGHTS} mainnet limit.`,
    );
}
