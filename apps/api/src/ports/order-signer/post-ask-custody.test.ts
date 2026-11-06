import { expect, test } from "bun:test";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { cancelAllAsks } from "../../modules/market/orders/cancel-all";
import { fixture } from "../../modules/market/testing/fixture";
import { postAskWithCustody } from "../../modules/market/use-cases/account/post-ask";
import { buy } from "../../modules/market/use-cases/trading/buy";
import type { MockClock } from "../clock/clock.mock";
import { configureCustodialSigner } from "./order-signer";
import { createMockOrderSigner } from "./order-signer.mock";

for (const scenario of [
  "success",
  "nonce",
  "expiry",
  "signature",
  "failure",
] as const) {
  test(`custodial ask awaits signing outside SQLite and handles ${scenario}`, async () => {
    const d = await fixture();
    try {
      await buy(d, d.user, d.key, 5, 10n ** 12n);
      const mock = createMockOrderSigner();
      configureCustodialSigner(d.ports, {
        async signCustodial(maker, digest) {
          expect(d.ports.db.inTransaction).toBe(false);
          await Promise.resolve();
          expect(d.ports.db.inTransaction).toBe(false);
          if (scenario === "nonce") cancelAllAsks(d, d.user);
          if (scenario === "expiry") (d.ports.clock as MockClock).advance(2000);
          if (scenario === "failure") throw new Error("Signing unavailable.");
          return mock.signCustodial(maker, digest);
        },
        verify(maker, digest, signature) {
          expect(d.ports.db.inTransaction).toBe(true);
          return (
            scenario !== "signature" && mock.verify(maker, digest, signature)
          );
        },
      });
      const pending = postAskWithCustody(d, d.user, d.key, 3, 1000000n, {
        expiry: timestampFromMs(d.ports.clock.now() + 1000),
      });
      if (scenario === "success") {
        expect((await pending).ask.nonce).toBe(0n);
        expect(
          d.ports.db.query("SELECT * FROM market_signed_asks").all(),
        ).toHaveLength(1);
      } else {
        const errors = {
          nonce: "nonce is stale",
          expiry: "expiry",
          signature: "Invalid ask signature",
          failure: "Signing unavailable",
        };
        await expect(pending).rejects.toThrow(errors[scenario]);
        expect(
          d.ports.db.query("SELECT * FROM market_signed_asks").all(),
        ).toHaveLength(0);
        expect(d.ports.activity.list({ kinds: ["ask_posted"] })).toHaveLength(
          0,
        );
      }
    } finally {
      d.ports.db.close();
    }
  });
}

test("Privy custody posts a real EIP-712 signature without holding a SQLite transaction", async () => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { createPrivyOrderSigner } = await import("./order-signer.privy");
  const { persistWalletCustody } = await import(
    "../wallet-custody/wallet-custody.sqlite"
  );
  const d = await fixture();
  try {
    await buy(d, d.user, d.key, 5, 10n ** 12n);
    const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
    const custody = persistWalletCustody(d.ports.db, "privy", {
      async getWallet() {
        return undefined;
      },
      async createWallet() {
        return { walletId: "privy-wallet", address: account.address };
      },
      async signTypedData(walletId, data) {
        expect(d.ports.db.inTransaction).toBe(false);
        expect(walletId).toBe("privy-wallet");
        return account.signTypedData(data);
      },
    });
    await custody.createWallet({ kind: "user", humanId: d.user.humanId });
    d.user.walletAddress = account.address;
    configureCustodialSigner(
      d.ports,
      createPrivyOrderSigner({ db: d.ports.db, custody }),
    );
    const result = await postAskWithCustody(d, d.user, d.key, 3, 1000000n);
    expect(result.ask.maker).toBe(account.address);
    expect(
      d.ports.db.query("SELECT signature FROM market_signed_asks").get(),
    ).toMatchObject({ signature: expect.stringMatching(/^0x[0-9a-f]{130}$/i) });
  } finally {
    d.ports.db.close();
  }
});
