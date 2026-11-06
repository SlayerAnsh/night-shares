import { expect, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { createMockReceptionTag } from "./reception-tag.mock";

function fixture() {
  const tag = createMockReceptionTag("test-secret", openDatabase(":memory:"));
  const now = 1_000_000;
  const input = { propertyId: "prop_test", bookingId: "bk_test", now };
  return { tag, input, payload: tag.issueTagPayload(input.propertyId, now) };
}

test("valid signed tag is accepted only once across bookings", () => {
  const { tag, input, payload } = fixture();
  expect(tag.verify({ ...input, payload })).toEqual({
    ok: true,
    tagId: input.propertyId,
    tagUid: `mock:${input.propertyId}`,
    counter: 1n,
  });
  expect(tag.verify({ ...input, payload, bookingId: "bk_other" }).ok).toBe(
    false,
  );
});

test("static, tampered, wrong-secret and other-property payloads are rejected", () => {
  const { tag, input, payload } = fixture();
  for (const forged of [
    input.propertyId,
    payload.replace("1000000", "999999"),
    createMockReceptionTag("other", openDatabase(":memory:")).issueTagPayload(
      input.propertyId,
      input.now,
    ),
    tag.issueTagPayload("prop_other", input.now),
  ]) {
    expect(tag.verify({ ...input, payload: forged }).ok).toBe(false);
  }
  expect(tag.verify({ ...input, payload }).ok).toBe(true);
});

test("stale and future tags are rejected while exact five minute boundary is valid", () => {
  const { tag, input, payload } = fixture();
  expect(tag.verify({ ...input, payload, now: input.now + 300_001 }).ok).toBe(
    false,
  );
  expect(tag.verify({ ...input, payload, now: input.now - 1 }).ok).toBe(false);
  expect(tag.verify({ ...input, payload, now: input.now + 300_000 }).ok).toBe(
    true,
  );
});

test("counter increases per tag and replay remains blocked across adapter restarts", () => {
  const db = openDatabase(":memory:");
  const input = { propertyId: "prop_test", bookingId: "bk_test", now: 1000 };
  const first = createMockReceptionTag("secret", db);
  const payload = first.issueTagPayload(input.propertyId, input.now);
  expect(first.verify({ ...input, payload })).toMatchObject({ counter: 1n });
  const restarted = createMockReceptionTag("secret", db);
  expect(restarted.verify({ ...input, payload }).ok).toBe(false);
  expect(
    restarted.verify({
      ...input,
      now: 1001,
      payload: restarted.issueTagPayload(input.propertyId, 1001),
    }),
  ).toMatchObject({ counter: 2n });
  expect(
    restarted.verify({
      ...input,
      propertyId: "prop_other",
      payload: restarted.issueTagPayload("prop_other", 1000),
    }),
  ).toMatchObject({ counter: 1n });
  db.close();
});
