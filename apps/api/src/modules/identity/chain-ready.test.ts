import { expect, test } from "bun:test";
import { fixture } from "../host/use-cases/fixture";
import { enrollmentId, ensureChainIdentity } from "./chain-ready";

test("canonical enrollment mapping accepts uint256 only", () => {
  expect(enrollmentId("0x42")).toBe(66n);
  expect(enrollmentId("42")).toBe(42n);
  expect(enrollmentId("a".repeat(64))).toBe(BigInt(`0x${"a".repeat(64)}`));
  for (const value of ["session-123", "0", "-1", (1n << 256n).toString()])
    expect(() => enrollmentId(value)).toThrow("canonical enrollment");
});

test("Selfie guests never enter the human exposure namespace during sign-in", async () => {
  const { ports } = fixture();
  ports.chainExecutor = {
    mode: "fork",
    pending: () => [],
    async execute() {
      throw new Error("Selfie must not link a human");
    },
    async recover() {
      throw new Error("unused");
    },
  };
  await ensureChainIdentity(ports, {
    id: "selfie",
    humanId: "123",
    level: "device",
    walletAddress: "0x0000000000000000000000000000000000000001",
  });
  expect(ports.db.query("SELECT * FROM identity_chain_ids").all()).toHaveLength(
    0,
  );
  ports.db.close();
});
