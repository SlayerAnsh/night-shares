import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { buy } from "../trading/buy";
import { postAsk } from "./post-ask";

test("posting and replacing leave all tokens in the maker wallet", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  const result = postAsk(d, d.user, d.key, 3, 10n ** 12n);
  expect(result.isAboveTwiceFair).toBe(true);
  expect(result.isAboveRecallCap).toBe(true);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(5);
  postAsk(d, d.user, d.key, 4, 1000000n);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(5);
  expect(
    d.ports.inventory
      .get(d.key)
      .state.traderAsks.filter((a) => a.who === d.user.walletAddress),
  ).toHaveLength(1);
});
test("posting cannot list unowned nights or nonpositive prices", async () => {
  const d = await fixture();
  expect(() => postAsk(d, d.user, d.key, 1, 1n)).toThrow("Not enough");
  expect(() => postAsk(d, d.user, d.key, 1, 0n)).toThrow("positive");
});
