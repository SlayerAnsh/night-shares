import { expect, test } from "bun:test";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { fixture } from "../../testing/fixture";
import { hostIdentity, isHost, tradeFeePayments } from "./host-fees";

for (const table of ["identity_users", "market_holders"] as const) {
  for (const emptyField of ["id", "humanId"] as const) {
    test(`unowned property ignores ${table} with empty ${emptyField}`, async () => {
      const { ports, user } = await fixture();
      try {
        const stranger = { ...user, [emptyField]: "" };
        const columns = "id, human_id, wallet_address";
        ports.db
          .query(
            table === "identity_users"
              ? `INSERT INTO identity_users (${columns}, level) VALUES (?, ?, ?, 'orb')`
              : `INSERT INTO market_holders (${columns}) VALUES (?, ?, ?)`,
          )
          .run(stranger.id, stranger.humanId, stranger.walletAddress);
        for (const ownerId of [undefined, "", "usr_missing"]) {
          ports.db.query("DELETE FROM host_owners").run();
          if (ownerId !== undefined)
            ports.db
              .query("INSERT INTO host_owners VALUES (?, ?)")
              .run("prop_unowned", ownerId);
          expect(hostIdentity(ports, "prop_unowned").walletAddress).toBe(
            SYSTEM_ADDRESSES.host,
          );
          expect(isHost(ports, "prop_unowned", stranger)).toBe(false);
          expect(
            isHost(ports, "prop_unowned", { ...user, id: "", humanId: "" }),
          ).toBe(false);
          expect(
            tradeFeePayments(
              ports,
              "prop_unowned",
              stranger,
              100000000n,
              1300000n,
            ),
          ).toContainEqual({ to: SYSTEM_ADDRESSES.host, amount: 1000000n });
        }
      } finally {
        ports.db.close();
      }
    });
  }
}

test("real owner matches by non-empty user or human identity", async () => {
  const { ports, user } = await fixture();
  try {
    ports.db
      .query("INSERT INTO host_owners VALUES (?, ?)")
      .run("prop_owned", user.id);
    ports.db
      .query("INSERT INTO identity_users VALUES (?, ?, 'orb', ?)")
      .run(user.humanId, user.id, user.walletAddress);
    expect(isHost(ports, "prop_owned", user)).toBe(true);
    expect(isHost(ports, "prop_owned", { ...user, id: "usr_alternate" })).toBe(
      true,
    );
    expect(isHost(ports, "prop_owned", { ...user, humanId: "" })).toBe(true);
    expect(
      isHost(ports, "prop_owned", { ...user, id: "usr_stranger", humanId: "" }),
    ).toBe(false);
    expect(
      tradeFeePayments(ports, "prop_owned", user, 100000000n, 1300000n),
    ).toContainEqual({ to: SYSTEM_ADDRESSES.rebatePool, amount: 1000000n });
    expect(hostIdentity(ports, "prop_owned").walletAddress).toBe(
      user.walletAddress,
    );
  } finally {
    ports.db.close();
  }
});

test("empty human wallet alias does not redirect unowned host fees to rebates", async () => {
  const { ports } = await fixture();
  try {
    ports.db
      .query(
        "INSERT INTO market_human_wallets (human_id, wallet_address) VALUES (?, ?)",
      )
      .run("", "stranger-wallet");
    for (const trader of ["stranger-wallet", "agent:stranger-wallet"])
      expect(
        tradeFeePayments(ports, "prop_unowned", trader, 100000000n, 1300000n),
      ).toContainEqual({ to: SYSTEM_ADDRESSES.host, amount: 1000000n });
  } finally {
    ports.db.close();
  }
});
