import { expect, test } from "bun:test";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import { fixture } from "../../testing/fixture";
import { createAgentOrder } from "../account/create-agent-order";
import { quoteBuy } from "../trading/quote-buy";
import { fundFixtureAgent } from "./testing";
import { getAgentWallet, transferAgentWallet } from "./wallet";

test("agent wallet starts empty, funding and withdrawal conserve money", async () => {
  const d = await fixture();
  const initial = await d.ports.walletProvider.balance(d.user.walletAddress);
  const empty = (await getAgentWallet(d, d.user)).wallet;
  expect(empty.address).toBe(`agent:${d.user.walletAddress}`);
  expect(empty.balance?.micros).toBe(0n);
  await transferAgentWallet(d, d.user, 123n);
  expect((await getAgentWallet(d, d.user)).wallet.balance?.micros).toBe(123n);
  await transferAgentWallet(d, d.user, 23n, true);
  expect(await d.ports.walletProvider.balance(d.user.walletAddress)).toBe(
    initial - 100n,
  );
  expect(
    d.ports.activity.list({ kinds: ["agent_wallet_funded"] }),
  ).toHaveLength(1);
  await expect(transferAgentWallet(d, d.user, 101n, true)).rejects.toThrow(
    "Not enough USDC",
  );
  await expect(transferAgentWallet(d, d.user, 0n)).rejects.toThrow("positive");
});

test("each order checks per-order cap, remaining budget and allowed nights", async () => {
  const d = await fixture();
  await fundFixtureAgent(d);
  const repo = agentWallets(d.ports.db);
  const total = quoteBuy(d, d.key, 1, d.user).total?.micros ?? 0n;
  repo.set(d.user, total * 2n, total - 1n, []);
  await expect(createAgentOrder(d, d.user, d.key, 1, total)).rejects.toThrow(
    "agent budget",
  );
  repo.set(d.user, total - 1n, total, []);
  await expect(createAgentOrder(d, d.user, d.key, 1, total)).rejects.toThrow(
    "agent budget",
  );
  repo.set(d.user, total, total, ["prop_velana:rt_velana_0:2026-12-02"]);
  await expect(createAgentOrder(d, d.user, d.key, 1, total)).rejects.toThrow(
    "not allowed",
  );
  repo.set(d.user, total, total, [d.key]);
  await createAgentOrder(d, d.user, d.key, 1, total);
  expect(repo.get(d.user).spent).toBe(total);
  expect(() => repo.set(d.user, total - 1n, total, [])).toThrow("below spent");
  await expect(
    createAgentOrder(d, d.user, d.key, 1, total * 2n),
  ).rejects.toThrow("agent budget");
});

test("fill spends only agent balance and exposes agent holdings and activity", async () => {
  const d = await fixture();
  await fundFixtureAgent(d);
  const userBalance = await d.ports.walletProvider.balance(
    d.user.walletAddress,
  );
  const initial =
    (await getAgentWallet(d, d.user)).wallet.balance?.micros ?? 0n;
  const { order } = await createAgentOrder(d, d.user, d.key, 1, 1000000000n);
  const wallet = (await getAgentWallet(d, d.user)).wallet;
  expect(wallet.balance?.micros).toBe(initial - (order.spent?.micros ?? 0n));
  expect(wallet.spent?.micros).toBe(order.spent?.micros);
  expect(wallet.holdings[0]?.size?.tenths).toBe(1);
  expect(order.walletAddress).toBe(wallet.address);
  expect(await d.ports.walletProvider.balance(d.user.walletAddress)).toBe(
    userBalance,
  );
  expect(d.ports.activity.list({ kinds: ["agent_order_filled"] })).toHaveLength(
    1,
  );
});

test("settlement observes atomic budget and inventory reservation then compensates failure", async () => {
  const d = await fixture();
  await fundFixtureAgent(d);
  const repo = agentWallets(d.ports.db);
  const before = d.ports.inventory.get(d.key);
  const original = d.ports.walletProvider.settle;
  d.ports.walletProvider.settle = async () => {
    expect(repo.get(d.user).spent).toBeGreaterThan(0n);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(1);
    expect(d.ports.inventory.get(d.key)).not.toEqual(before);
    throw new Error("Injected settlement failure");
  };
  await expect(
    createAgentOrder(d, d.user, d.key, 1, 1000000000n),
  ).rejects.toThrow("Injected settlement failure");
  expect(repo.get(d.user).spent).toBe(0n);
  expect(d.ports.inventory.get(d.key)).toEqual(before);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
  expect(d.repo.account(d.user.humanId).orders.size).toBe(0);
  d.ports.walletProvider.settle = original;
  await createAgentOrder(d, d.user, d.key, 1, 1000000000n);
  expect(repo.get(d.user).spent).toBeGreaterThan(0n);
});

test("unfunded agent cannot spend the human wallet and failed budget reservation changes nothing", async () => {
  const d = await fixture();
  const repo = agentWallets(d.ports.db);
  repo.set(d.user, 1000000000n, 1000000000n, []);
  const before = d.ports.inventory.get(d.key);
  await expect(
    createAgentOrder(d, d.user, d.key, 1, 1000000000n),
  ).rejects.toThrow("Not enough USDC");
  expect(repo.get(d.user).spent).toBe(0n);
  expect(d.ports.inventory.get(d.key)).toEqual(before);
});

test("concurrent orders cannot overspend the remaining budget", async () => {
  const d = await fixture();
  await fundFixtureAgent(d);
  const total = quoteBuy(d, d.key, 1, d.user).total?.micros ?? 0n;
  agentWallets(d.ports.db).set(d.user, total, total * 2n, []);
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      d.repo.exclusive(d.user.humanId, () =>
        createAgentOrder(d, d.user, d.key, 1, total * 2n),
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(total);
});
