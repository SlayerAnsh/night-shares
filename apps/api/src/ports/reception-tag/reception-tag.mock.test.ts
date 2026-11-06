import { expect, test } from "bun:test";
import { createMockReceptionTag } from "./reception-tag.mock";

function fixture() {
  const tag = createMockReceptionTag("test-secret");
  const now = 1_000_000;
  const input = { propertyId: "prop_test", bookingId: "bk_test", now };
  return { tag, input, payload: tag.issueTagPayload(input.propertyId, now) };
}

test("valid signed tag is accepted only once across bookings", () => {
  const { tag, input, payload } = fixture();
  expect(tag.verify({ ...input, payload })).toEqual({
    ok: true,
    tagId: input.propertyId,
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
    createMockReceptionTag("other").issueTagPayload(
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
