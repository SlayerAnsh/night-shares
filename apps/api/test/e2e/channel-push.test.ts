import { expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import {
  DemandPreset,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
import { createHarness } from "./harness";

test("hotel push failures leave open and edit unchanged", async () => {
  const h = await createHarness();
  try {
    const { clients } = await h.signInAs("orb", "host");
    const { ports } = h.container;
    const key = "prop_velana:rt_velana_0:2026-12-24";
    const selection = {
      propertyId: "prop_velana",
      roomTypeIds: ["rt_velana_0"],
      dates: ["2026-12-24"],
      allotmentPercent: 100,
      demandPreset: DemandPreset.PEAK,
      releasePolicy: ReleasePolicy.DAY_BEFORE_18,
    };
    ports.channelManager.setPushFailure?.(true);
    for (const stopped of [true, false]) {
      ports.inventory.update(key, (record) => ({
        ...record,
        stopped,
        openedAt: 0,
      }));
      const before = ports.inventory.get(key);
      await expect(
        clients.host.openNights({ selection }),
      ).rejects.toMatchObject({
        code: Code.Unavailable,
        rawMessage: "The hotel system did not confirm. Nothing changed.",
      });
      expect(ports.inventory.get(key)).toEqual(before);
    }
    expect(
      ports.activity
        .list({ nightKey: key })
        .filter((e) => e.kind === "channel_push_failed"),
    ).toHaveLength(2);
  } finally {
    await h.close();
  }
});
