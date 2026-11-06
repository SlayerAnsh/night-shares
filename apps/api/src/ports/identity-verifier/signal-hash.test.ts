import { expect, test } from "bun:test";
import { signalHash } from "./signal-hash";

test("signal hashing uses Keccak-256 shifted right by eight bits, not SHA3", () => {
  expect(signalHash("")).toBe(
    "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
  );
  expect(signalHash("hello")).toBe(
    "0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea",
  );
});

// Golden vectors from the pinned IDKit core 2.1.0 hashToField implementation.
test("signal hashes match IDKit for purposes, UTF-8 and sponge block boundaries", () => {
  const vectors = [
    [
      "sign_in:nonce_0001",
      "0x003a7fcf678c98ad4aad0e8546965c1f2207922b8c352fdd66b4460eeeaea0f1",
    ],
    [
      "approve_agent_order:nonce_abc",
      "0x002d2ce3b90f3f2c5d5bb629ec938a21eb7324c3e640d1184ed77c1b57268e61",
    ],
    [
      "a".repeat(135),
      "0x0034367dc248bbd832f4e3e69dfaac2f92638bd0bbd18f2912ba4ef454919cf4",
    ],
    [
      "a".repeat(136),
      "0x00a6c4d403279fe3e0af03729caada8374b5ca54d8065329a3ebcaeb4b60aa38",
    ],
    [
      "a".repeat(137),
      "0x00d869f639c7046b4929fc92a4d988a8b22c55fbadb802c0c66ebcd484f1915f",
    ],
    [
      "🌍".repeat(80),
      "0x007a4a3c8686f344c934d9a60156af140ba2c51936680ffa292bff9051bcb557",
    ],
  ] as const;
  for (const [signal, expected] of vectors)
    expect(signalHash(signal)).toBe(expected);
});
