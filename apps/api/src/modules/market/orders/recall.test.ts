import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { CreateBookingRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import { fixture } from "../../stay/test-support/fixture";
import { createSqliteMarketRepo } from "../repo/market-repo.sqlite";
import { postAsk } from "../use-cases/account/post-ask";
import { getBook } from "../use-cases/queries/get-book";
import { buy } from "../use-cases/trading/buy";

for (const fails of [false, true]) {
  test(`recall of signed holdings ${fails ? "compensates" : "limits later fills"}`, async () => {
    const f = fixture();
    try {
      const deps = { ports: f.ports, repo: createSqliteMarketRepo(f.ports.db) };
      const maker = {
        id: "usr_maker",
        humanId: "maker",
        level: "orb" as const,
        walletAddress: await f.ports.walletProvider.linkWallet("maker"),
      };
      const guest = {
        ...maker,
        id: "usr_guest",
        humanId: "guest",
        walletAddress: await f.ports.walletProvider.linkWallet("guest"),
      };
      f.ports.inventory.update(f.key, (r) => ({
        ...r,
        state: {
          ...r.state,
          F: 100,
          k: 0,
          S: 10,
          q: 0,
          held: 0,
          booked: 0,
          traderAsks: [],
        },
      }));
      await buy(deps, maker, f.key, 20, 10n ** 12n);
      const ask = postAsk(deps, maker, f.key, 20, 200000000n).ask;
      f.ports.inventory.update(f.key, (r) => ({
        ...r,
        state: { ...r.state, q: 10, booked: 8 },
      }));
      f.selection.checkOut = "2026-12-05";
      const quote = f.cases.quoteStay(f.selection);
      const lock = f.cases.lockQuote(quote.id, guest.id);
      const request = create(CreateBookingRequestSchema, {
        lockId: lock.id,
        guestName: "Test Guest",
        guestEmail: "guest@example.test",
      });
      const before = { ...deps.repo.position(maker.humanId, f.key) };
      if (fails) {
        f.ports.walletProvider.settle = async () => {
          throw new Error("settlement failed");
        };
        await expect(f.cases.createBooking(request, guest)).rejects.toThrow(
          "settlement failed",
        );
        expect(deps.repo.position(maker.humanId, f.key)).toEqual(before);
        expect(
          getBook(deps, f.key).asks.find((a) => a.askId === ask.id)?.size
            .tenths,
        ).toBe(20);
      } else {
        await f.cases.createBooking(request, guest);
        expect(deps.repo.position(maker.humanId, f.key).free).toBe(10);
        expect(
          getBook(deps, f.key).asks.find((a) => a.askId === ask.id)?.size
            .tenths,
        ).toBe(10);
        await buy(deps, guest, f.key, 10, 10n ** 12n);
        expect(deps.repo.position(maker.humanId, f.key).free).toBe(0);
      }
    } finally {
      f.ports.db.close();
    }
  });
}
