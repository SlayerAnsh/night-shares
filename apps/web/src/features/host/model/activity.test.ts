import { expect, test } from "bun:test";
import type { Activity } from "@night-shares/proto/host/v1/hotel_pb";
import { activityLabel, activityRows } from "./activity";

test("simultaneous activity retains all room counts and money", () => {
  const events: Activity[] = [1, 2].map((tenths) => ({
    $typeName: "night_shares.host.v1.Activity",
    kind: "trader_bought",
    at: { $typeName: "google.protobuf.Timestamp", seconds: 100n, nanos: 0 },
    size: { $typeName: "night_shares.common.v1.RoomNights", tenths },
    amount: {
      $typeName: "night_shares.common.v1.Usdc",
      micros: BigInt(tenths) * 1000001n,
    },
  }));
  expect(activityRows(events)).toHaveLength(1);
  expect(activityRows(events)[0]?.tenths).toBe(3);
  expect(activityRows(events)[0]?.micros).toBe(3000003n);
  expect(activityLabel("trader_bought")).toBe("Trader took rooms");
});
