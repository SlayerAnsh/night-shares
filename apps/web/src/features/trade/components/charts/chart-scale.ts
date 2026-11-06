// Pure scale helpers shared by the trade SVG charts.
export type Point = { at: number; value: number };

export function domain(values: number[], padRatio = 0.15) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * padRatio || Math.max(1, Math.abs(max) * 0.05);
  return { min: min - pad, max: max + pad };
}

export function linePath(xs: number[], ys: number[]) {
  return xs
    .map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${(ys[i] ?? 0).toFixed(1)}`)
    .join(" ");
}

// Keep two end labels at least `gap` pixels apart without leaving the plot.
export function spreadLabels(
  a: number,
  b: number,
  top: number,
  bottom: number,
  gap = 30,
) {
  let ya = a;
  let yb = b;
  if (Math.abs(ya - yb) < gap) {
    const centre = (ya + yb) / 2;
    const up = ya <= yb ? -1 : 1;
    ya = centre + (up * gap) / 2;
    yb = centre - (up * gap) / 2;
  }
  const clamp = (y: number) => Math.max(top + 12, Math.min(bottom - 14, y));
  const shift = clamp(ya) - ya || clamp(yb) - yb;
  return [ya + shift, yb + shift] as const;
}
