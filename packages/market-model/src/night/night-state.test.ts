import { expect, test } from "bun:test";
import { nightState } from "./night-state";

const property = {
  id: "test",
  base: 100,
  phase: 0,
  rooms: 5,
  roomTypes: [{ rateMultiplier: 1 }, { rateMultiplier: 1.5 }],
};
test("night state rounds odd room allotments up and selects holiday demand", () => {
  const state = nightState({
    property,
    roomIndex: 0,
    date: "2026-12-25",
    today: "2026-12-01",
  });
  expect(state.S).toBe(3);
  expect(state.preset).toBe("peak");
  expect(state.hoursLeft).toBe(590);
});
test("past nights use fourteen hours and empty room types reject invalid property", () => {
  expect(
    nightState({
      property,
      roomIndex: 0,
      date: "2026-11-01",
      today: "2026-12-01",
    }).hoursLeft,
  ).toBe(14);
  expect(() =>
    nightState({
      property: { ...property, roomTypes: [] },
      roomIndex: 0,
      date: "2026-12-01",
      today: "2026-12-01",
    }),
  ).toThrow(TypeError);
});
