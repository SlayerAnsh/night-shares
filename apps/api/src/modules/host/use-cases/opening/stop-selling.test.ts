import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { NightKeySchema } from "@night-shares/proto/common/v1/night_pb";
import { fixture } from "../fixture";

test("stop returns unsold rooms through activity while preserving curve obligations", async () => {
  const f = fixture(),
    before = f.ports.inventory.get(f.key);
  const night = create(NightKeySchema, before);
  const result = await f.use.stopSelling(f.userId, [night, night]);
  expect(result.nights).toHaveLength(1);
  expect(result.roomsTakenBack.tenths).toBe(
    Math.round((before.state.S - before.state.booked - before.state.held) * 10),
  );
  expect(result.nights[0]?.onSale.tenths).toBe(0);
  expect(f.ports.inventory.get(f.key).state).toEqual(before.state);
  expect(f.ports.activity.list({ nightKey: f.key })[0]?.tenths).toBe(
    Math.round((before.state.S - before.state.booked - before.state.held) * 10),
  );
  expect(
    (await f.use.stopSelling(f.userId, [night])).roomsTakenBack.tenths,
  ).toBe(0);
  expect(f.ports.activity.list({ nightKey: f.key })).toHaveLength(1);
});
