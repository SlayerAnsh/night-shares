import { expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { fixture } from "../fixture";

for (const mode of ["open", "edit"] as const) {
  test(`failed ${mode} push restores inventory and release policy`, async () => {
    const f = fixture();
    f.ports.inventory.update(f.key, (record) => ({
      ...record,
      stopped: mode === "open",
      openedAt: 0,
    }));
    const before = f.ports.inventory.get(f.key);
    const policy = f.repo.release(f.key);
    f.ports.channelManager.setPushFailure?.(true);
    const change = f.use.openNights(f.userId, f.selection);
    await expect(change).rejects.toMatchObject({
      code: Code.Unavailable,
      rawMessage: "The hotel system did not confirm. Nothing changed.",
    });
    expect(f.ports.inventory.get(f.key)).toEqual(before);
    expect(f.repo.release(f.key)).toBe(policy);
    expect(
      f.ports.activity.list({ nightKey: f.key }).map((event) => event.kind),
    ).toEqual(["channel_push_failed"]);
    f.ports.channelManager.setPushFailure?.(false);
    await f.use.openNights(f.userId, f.selection);
    expect(f.ports.inventory.get(f.key).stopped).toBe(false);
  });
}
test("failed batch push restores every selected night", async () => {
  const f = fixture();
  f.selection.dates.push("2026-12-25");
  const keys = f.selection.dates.map(
    (date) => `prop_velana:rt_velana_0:${date}`,
  );
  const before = keys.map((key) =>
    f.ports.inventory.update(key, (r) => ({ ...r, openedAt: 0 })),
  );
  f.ports.channelManager.setPushFailure?.(true);
  await expect(f.use.openNights(f.userId, f.selection)).rejects.toThrow(
    "Nothing changed.",
  );
  expect(keys.map((key) => f.ports.inventory.get(key))).toEqual(before);
});
