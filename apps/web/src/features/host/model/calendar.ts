// Night dates are ISO strings in the property's calendar, so all math runs in UTC.
const DAY = 86400000;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const at = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function todayIso(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return new Date(at(date) + days * DAY).toISOString().slice(0, 10);
}

export function isMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value) && Number.isFinite(at(`${value}-01`));
}

export function shiftMonth(month: string, months: number) {
  const date = new Date(at(`${month}-01`));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

export function monthDates(month: string): string[] {
  if (!isMonth(month)) return [];
  const next = at(`${shiftMonth(month, 1)}-01`);
  const out: string[] = [];
  for (let t = at(`${month}-01`); t < next; t += DAY)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Monday is 0, Sunday is 6, as the calendar grid starts on Monday. */
export function weekdayMon(date: string) {
  return (new Date(at(date)).getUTCDay() + 6) % 7;
}

export function isWeekendNight(date: string) {
  const day = new Date(at(date)).getUTCDay();
  return day === 5 || day === 6;
}

// Holiday nights run from Dec 20 to Jan 2, the same window the mock uses.
export function isHoliday(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return (m === 12 && (d ?? 0) >= 20) || (m === 1 && (d ?? 0) <= 2);
}

export function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function shortMonth(month: string) {
  return (MONTHS[Number(month.slice(5, 7)) - 1] ?? "").slice(0, 3);
}

/** "Thu 24 Dec" */
export function shortNight(date: string) {
  const d = new Date(at(date));
  if (Number.isNaN(d.getTime())) return date;
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]?.slice(0, 3)}`;
}

/** "Dec 24" */
export function dayMonth(date: string) {
  const d = new Date(at(date));
  if (Number.isNaN(d.getTime())) return date;
  return `${MONTHS[d.getUTCMonth()]?.slice(0, 3)} ${d.getUTCDate()}`;
}

export function rangeDates(a: string, b: string) {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 240; d = addDays(d, 1))
    out.push(d);
  return out;
}

type Instant = { seconds: bigint; nanos: number };

export function instantMs(at: Instant) {
  return Number(at.seconds) * 1000 + at.nanos / 1e6;
}

/** "Dec 24, 14:00" in UTC, the calendar the API reports instants in. */
export function shortInstant(at?: Instant) {
  if (!at) return "Not scheduled";
  const d = new Date(instantMs(at));
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]?.slice(0, 3)} ${d.getUTCDate()}, ${hh}:${mm}`;
}

/** "in 3 days, 4 hours", or undefined once the moment has passed. */
export function countdown(at: Instant, now = Date.now()) {
  const ms = instantMs(at) - now;
  if (ms <= 0) return undefined;
  const h = Math.floor(ms / 36e5);
  const d = Math.floor(h / 24);
  const m = Math.floor((ms % 36e5) / 6e4);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d) return `in ${plural(d, "day")}, ${plural(h % 24, "hour")}`;
  return h ? `in ${plural(h, "hour")}, ${m} min` : `in ${m} min`;
}
