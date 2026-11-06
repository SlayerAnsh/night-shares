import { expect, test } from "bun:test";
import { applyGuestBooking } from "./apply-guest-booking";
import { fixture } from "./fixture";

test("applyGuestBooking updates state without changing its input", () => {
  const record = fixture();

  const before = structuredClone(record);
  const next = applyGuestBooking(record, 10);
  expect(next.state.q).toBe(2);
  expect(next.state.held).toBe(0);
  expect(next.state.booked).toBe(2);
  expect(record).toEqual(before);
});
