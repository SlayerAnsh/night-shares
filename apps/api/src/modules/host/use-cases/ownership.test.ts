import { expect, test } from "bun:test";
import { mockSubjectFor } from "../../../ports/identity-verifier/identity-verifier.mock";
import { createMemoryHostRepo } from "../repo/host-repo.memory";
import { fixture } from "./fixture";

test("only the mock host subject receives seeded hotels lazily", () => {
  const f = fixture();
  const repo = createMemoryHostRepo(f.ports.catalog);
  const user = {
    id: "owner",
    humanId: mockSubjectFor("host"),
    level: "orb" as const,
    walletAddress: "",
  };
  expect(repo.connections(user.id).size).toBe(0);
  repo.initialize({ ...user, id: "other", humanId: mockSubjectFor("other") });
  expect(repo.connections("other").size).toBe(0);
  expect(() => repo.claim("other", "prop_velana")).toThrow(
    "managed by another host",
  );
  repo.initialize(user);
  expect(repo.connections(user.id).size).toBe(4);
  expect(repo.owner("prop_salinas")).toBeUndefined();
  expect(repo.owner("prop_machiya")).toBeUndefined();
});

test("non-owner cannot read or open another host's property", async () => {
  const f = fixture();
  expect(f.use.getPortfolio("other").hotels).toEqual([]);
  for (const call of [
    () => f.use.getHotel("other", "prop_velana", "2026-12"),
    () => f.use.getNight("other", "prop_velana", "2026-12-24"),
    () => f.use.getPayout("other", "prop_velana"),
    () => f.use.previewOpenNights("other", f.selection),
    () => f.use.openNights("other", f.selection),
  ])
    expect(call).toThrow("This property is managed by another host.");
  await expect(
    f.use.connectChannelManager("other", "prop_velana", 1),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});

test("concurrent connections claim an unowned property only once", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.use.connectChannelManager(f.userId, "prop_salinas", 1),
    f.use.connectChannelManager("other", "prop_salinas", 1),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(f.repo.owner("prop_salinas")).toBe(f.userId);
});
