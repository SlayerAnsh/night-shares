import { expect, test } from "bun:test";
import { fixture } from "./fixture";

test("host imports a fifth hotel without connecting it for another host", async () => {
  const f = fixture();
  const property = await f.use.connectChannelManager(
    f.userId,
    "prop_machiya",
    2,
  );
  expect(property.roomTypes).toHaveLength(2);
  expect(f.repo.connections(f.userId).get(property.id)?.pms).toBe("Cloudbeds");
  expect(f.repo.connections("other").has(property.id)).toBe(false);
  await expect(
    f.use.connectChannelManager(f.userId, property.id, 0),
  ).rejects.toThrow("supported PMS");
});
