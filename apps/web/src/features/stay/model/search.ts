export function readSearch(params: URLSearchParams) {
  const count = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(params.get(key) ?? fallback);
    return Number.isInteger(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  };
  return {
    destination: params.get("destination") ?? "",
    type: params.get("type") ?? "All",
    sort: params.get("sort") ?? "rec",
    checkIn: params.get("checkIn") ?? "",
    checkOut: params.get("checkOut") ?? "",
    adults: count("adults", 2, 1, 16),
    kids: count("kids", 0, 0, 8),
    rooms: count("rooms", 1, 1, 8),
  };
}
export function validDates(checkIn: string, checkOut: string) {
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  return valid(checkIn) && valid(checkOut) && checkOut > checkIn;
}
export function stayHref(
  path: string,
  params: URLSearchParams,
  updates: Record<string, string> = {},
) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return `${path}?${next}`;
}
export function remainingTime(
  expiresAt: { seconds: bigint; nanos: number } | undefined,
  now: number,
) {
  const seconds = expiresAt
    ? Math.max(
        0,
        Math.ceil(
          (Number(expiresAt.seconds) * 1000 + expiresAt.nanos / 1e6 - now) /
            1000,
        ),
      )
    : 0;
  return {
    seconds,
    label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  };
}
