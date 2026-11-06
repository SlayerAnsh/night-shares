import { parseDate } from "../dates";
import { hash } from "../random/hash";
import { rng } from "../random/rng";

export interface RateProperty {
  id: string;
  base: number;
  phase: number;
}

export function nightPrice(p: RateProperty, date: string): number {
  const d = parseDate(date);
  const r = rng(hash(p.id + date))();
  const dow = d.getUTCDay();
  const wk = dow === 5 || dow === 6 ? 0.22 : 0;
  const season =
    0.14 *
    Math.sin(
      ((d.getUTCMonth() + d.getUTCDate() / 31) / 12) * 2 * Math.PI + p.phase,
    );
  const m = d.getUTCMonth(),
    dd = d.getUTCDate();
  const holiday = (m === 11 && dd >= 20) || (m === 0 && dd <= 2) ? 0.55 : 0;
  return Math.round(p.base * (1 + wk + season + holiday + (r - 0.5) * 0.12));
}
