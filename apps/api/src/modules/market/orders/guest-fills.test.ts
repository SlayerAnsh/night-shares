import { expect, test } from "bun:test";
import { bookingFixture } from "../../stay/test-support/fixture";
import { createSqliteMarketRepo } from "../repo/market-repo.sqlite";
import { postAsk } from "../use-cases/account/post-ask";
import { buy } from "../use-cases/trading/buy";

for (const fails of [false, true]) {
  test(`signed guest fill ${fails ? "compensates" : "debits"} maker holdings`, async () => {
    const f = await bookingFixture();
    try {
      const deps = { ports: f.ports, repo: createSqliteMarketRepo(f.ports.db) };
      const maker = {
        id: "usr_maker",
        humanId: "maker",
        level: "orb" as const,
        walletAddress: await f.ports.walletProvider.linkWallet("maker"),
      };
      await buy(deps, maker, f.key, 5, 10n ** 12n);
      postAsk(deps, maker, f.key, 5, 1000000n);
      const before = { ...deps.repo.position(maker.humanId, f.key) };
      const inventory = f.ports.inventory.get(f.key);
      if (fails) {
        f.ports.walletProvider.settle = async () => {
          throw new Error("settlement failed");
        };
        await expect(f.cases.createBooking(f.request, f.user)).rejects.toThrow(
          "settlement failed",
        );
        expect(deps.repo.position(maker.humanId, f.key)).toEqual(before);
        expect(f.ports.inventory.get(f.key)).toEqual(inventory);
      } else {
        await f.cases.createBooking(f.request, f.user);
        expect(deps.repo.position(maker.humanId, f.key).free).toBe(0);
        expect(deps.repo.position(maker.humanId, f.key).escrow).toBe(0);
      }
    } finally {
      f.ports.db.close();
    }
  });
}
