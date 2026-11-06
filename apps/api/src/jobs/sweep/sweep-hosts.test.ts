import { expect, test } from "bun:test";
import { createSqliteHostRepo } from "../../modules/host/repo/host-repo.sqlite";
import { fixture } from "../../modules/host/use-cases/fixture";
import { createGetPayout } from "../../modules/host/use-cases/payout/get-payout";
import { sweepHosts } from "./sweep-hosts";

test("each tick sweeps connected properties to their registered owner wallets", async () => {
  const { ports } = fixture();
  const repo = createSqliteHostRepo(ports);
  const wallets = [];
  for (const [id, property] of [
    ["alice", "prop_salinas"],
    ["bob", "prop_machiya"],
  ] as const) {
    const address = await ports.walletProvider.linkWallet(id);
    ports.db
      .query("INSERT INTO identity_users VALUES (?, ?, 'orb', ?)")
      .run(id, id, address);
    repo.claim(id, property);
    const available = createGetPayout({ ports, repo })(id, property)
      .availableNow.micros;
    wallets.push({
      address,
      available,
      before: await ports.walletProvider.balance(address),
    });
  }
  await sweepHosts(ports);
  await sweepHosts(ports);
  for (const wallet of wallets) {
    expect(await ports.walletProvider.balance(wallet.address)).toBe(
      wallet.before + wallet.available,
    );
    expect(
      await ports.walletProvider.transactions(wallet.address),
    ).toHaveLength(1);
  }
  expect(
    ports.db.query("SELECT * FROM host_sweeps WHERE status = 'settled'").all(),
  ).toHaveLength(2);
});
