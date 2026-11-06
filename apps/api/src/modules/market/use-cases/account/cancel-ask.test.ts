import { expect, test } from "bun:test";
import { applyTraderAskFill } from "../../../inventory/mutations/apply-trader-ask-fill";
import { fixture } from "../../testing/fixture";
import { buy } from "../trading/buy";
import { cancelAsk } from "./cancel-ask";
import { postAsk } from "./post-ask";

test("cancel returns remaining escrow after an external guest fill", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  const { ask } = postAsk(d, d.user, d.key, 5, 1000000n);
  d.ports.inventory.update(d.key, (r) =>
    applyTraderAskFill(
      r,
      r.state.traderAsks.findIndex((a) => a.who === d.user.walletAddress),
      2,
    ),
  );
  cancelAsk(d, d.user, ask.id);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(3);
  expect(d.ports.activity.list({ nightKey: d.key })[0]).toMatchObject({
    kind: "ask_cancelled",
    tenths: 3,
  });
  expect(d.repo.position(d.user.humanId, d.key).escrow).toBe(0);
  expect(() => cancelAsk(d, d.user, ask.id)).toThrow("Ask not found.");
});
test("cancel rejects a different owner", async () => {
  const d = await fixture();
  expect(() => cancelAsk(d, d.user, `${d.key}|someone_else`)).toThrow(
    "Ask not found.",
  );
});
