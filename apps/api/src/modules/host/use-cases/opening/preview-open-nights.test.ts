import { expect, test } from "bun:test";
import {
  cost,
  PRESETS,
  recallStrike,
  toMicros,
} from "@night-shares/market-model";
import { fixture } from "../fixture";

test("preview uses model prices and retains committed rooms at low allotment", () => {
  const f = fixture();
  f.selection.allotmentPercent = 10;
  const before = f.ports.inventory.get(f.key);
  const preview = f.use.previewOpenNights(f.userId, f.selection).nights[0];
  expect(preview).toBeDefined();
  if (!preview) return;
  const F = Number(preview.floor.micros) / 1e6,
    S = preview.allotment.tenths / 10;
  expect(preview.guestPriceCap.micros).toBe(
    toMicros(recallStrike(F, PRESETS.peak)),
  );
  expect(preview.minimumPayout.micros).toBe(
    toMicros(cost(F, PRESETS.peak, S, 0, S)),
  );
  expect(S).toBeGreaterThanOrEqual(before.state.booked + before.state.held);
  expect(f.ports.inventory.get(f.key)).toEqual(before);
});

test("preview counts selected slots and retained commitments", () => {
  const f = fixture();
  expect(f.use.previewOpenNights(f.userId, f.selection)).toMatchObject({
    slots: 1,
    kept: 0,
  });
  f.selection.allotmentPercent = 10;
  expect(f.use.previewOpenNights(f.userId, f.selection)).toMatchObject({
    slots: 1,
    kept: 1,
  });
});
