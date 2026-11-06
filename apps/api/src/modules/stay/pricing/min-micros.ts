export function minMicros(a: bigint, b: bigint): bigint {
  if (a < b) return a;
  return b;
}
