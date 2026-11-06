import { expect, test } from "bun:test";
import { tapEvidenceHash } from "./walk-attestation";

test("evidence hashes the canonical tap and booking deterministically", () => {
  const tap = { tagUid: "mock:prop_test", counter: 1n, tapAt: 1000 };
  expect(tapEvidenceHash(tap, "bk_test")).toBe(
    "178b6939e912e095465d68ea6aedbdf2f876da973aff3d4537ab9c039f99e7b7",
  );
  expect(tapEvidenceHash({ ...tap }, "bk_test")).toBe(
    tapEvidenceHash(tap, "bk_test"),
  );
  for (const changed of [
    { ...tap, counter: 2n },
    { ...tap, tapAt: 1001 },
    { ...tap, tagUid: "other" },
  ])
    expect(tapEvidenceHash(changed, "bk_test")).not.toBe(
      tapEvidenceHash(tap, "bk_test"),
    );
  expect(tapEvidenceHash(tap, "bk_other")).not.toBe(
    tapEvidenceHash(tap, "bk_test"),
  );
});
