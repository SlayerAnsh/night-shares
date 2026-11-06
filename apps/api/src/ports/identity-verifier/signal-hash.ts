// Keccak-256 uses the original Keccak padding, not SHA3-256 padding.
const mask = (1n << 64n) - 1n;
const rotations = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];
const rounds = [
  0x1n,
  0x8082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x808bn,
  0x80000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x8an,
  0x88n,
  0x80008009n,
  0x8000000an,
  0x8000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x80000001n,
  0x8000000080008008n,
];
function rotate(value: bigint, bits: number) {
  return ((value << BigInt(bits)) | (value >> BigInt(64 - bits))) & mask;
}
function permute(state: bigint[]) {
  for (const round of rounds) {
    const columns = Array.from({ length: 5 }, (_, x) =>
      [0, 5, 10, 15, 20].reduce((sum, y) => sum ^ (state[x + y] ?? 0n), 0n),
    );
    const moved = Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      const delta =
        (columns[(x + 4) % 5] ?? 0n) ^ rotate(columns[(x + 1) % 5] ?? 0n, 1);
      for (let y = 0; y < 5; y++) {
        const i = x + 5 * y;
        moved[y + 5 * ((2 * x + 3 * y) % 5)] = rotate(
          (state[i] ?? 0n) ^ delta,
          rotations[i] ?? 0,
        );
      }
    }
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] =
          (moved[x + 5 * y] ?? 0n) ^
          (~(moved[((x + 1) % 5) + 5 * y] ?? 0n) &
            (moved[((x + 2) % 5) + 5 * y] ?? 0n));
      }
    state[0] = (state[0] ?? 0n) ^ round;
  }
}
export function signalHash(signal: string): string {
  const input = new TextEncoder().encode(signal);
  const padded = new Uint8Array(Math.ceil((input.length + 1) / 136) * 136);
  padded.set(input);
  padded[input.length] = 1;
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) | 128;
  const state = Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += 136) {
    for (let i = 0; i < 136; i++)
      state[i >> 3] =
        (state[i >> 3] ?? 0n) ^
        (BigInt(padded[offset + i] ?? 0) << BigInt((i % 8) * 8));
    permute(state);
  }
  const hex = Array.from({ length: 32 }, (_, i) =>
    Number(((state[i >> 3] ?? 0n) >> BigInt((i % 8) * 8)) & 255n)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
  return `0x${(BigInt(`0x${hex}`) >> 8n).toString(16).padStart(64, "0")}`;
}
