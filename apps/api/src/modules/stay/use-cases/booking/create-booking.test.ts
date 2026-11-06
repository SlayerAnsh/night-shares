import { expect, test } from "bun:test";
import { PayMethod } from "@night-shares/proto/stay/v1/trip_pb";
import { routeNight } from "../../pricing/quote-night";
import { bookingFixture } from "../../test-support/fixture";
import { fillNight } from "./fill-night";

test("USDC booking burns room nights, pays exact total and returns a private trip", async () => {
  const f = await bookingFixture();
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const booked = f.ports.inventory.get(f.key).state.booked;
  const trip = await f.cases.createBooking(f.request, f.user);
  expect(
    before - (await f.ports.walletProvider.balance(f.user.walletAddress)),
  ).toBe(trip.total?.micros ?? 0n);
  expect(f.ports.inventory.get(f.key).state.booked).toBe(booked + 1);
  expect(trip.ref).toMatch(/^NS-\w{5}$/);
  expect(trip.hotelRef).toBeTruthy();
  expect(trip).not.toHaveProperty("guestName");
  expect(f.cases.listTrips(f.user.id).upcoming).toHaveLength(1);
  expect(f.ports.activity.list({ kinds: ["guest_booked"] })).toHaveLength(2);
  await expect(f.cases.createBooking(f.request, f.user)).rejects.toThrow(
    "Quote lock",
  );
});
test("card payment credits wallet before settlement", async () => {
  const f = await bookingFixture();
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  await f.cases.createBooking(
    { ...f.request, payMethod: PayMethod.CARD },
    f.user,
  );
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before,
  );
  expect(
    (await f.ports.walletProvider.transactions(f.user.walletAddress)).some(
      (tx) => tx.memo === "onramp",
    ),
  ).toBe(true);
});
test("foreign and expired locks reject before payment", async () => {
  const f = await bookingFixture();
  await expect(
    f.cases.createBooking(f.request, { ...f.user, id: "other" }),
  ).rejects.toThrow("Quote lock");
  f.ports.clock = { now: () => f.lock.expiresAt, today: () => "2026-12-01" };
  await expect(f.cases.createBooking(f.request, f.user)).rejects.toThrow(
    "Quote lock",
  );
  expect(
    await f.ports.walletProvider.transactions(f.user.walletAddress),
  ).toHaveLength(0);
});
test("insufficient balance and unavailable later nights never mutate earlier nights", async () => {
  const f = await bookingFixture();
  const initial = f.ports.inventory.get(f.key);
  await f.ports.walletProvider.transfer(
    f.user.walletAddress,
    "pool",
    await f.ports.walletProvider.balance(f.user.walletAddress),
    "drain",
  );
  await expect(f.cases.createBooking(f.request, f.user)).rejects.toThrow(
    "Not enough USDC.",
  );
  expect(f.ports.inventory.get(f.key)).toEqual(initial);
  f.ports.inventory.update("prop_velana:rt_velana_0:2026-12-05", (r) => ({
    ...r,
    stopped: true,
  }));
  await expect(f.cases.createBooking(f.request, f.user)).rejects.toThrow(
    "Not enough rooms",
  );
  expect(f.ports.inventory.get(f.key)).toEqual(initial);
});
test("price increases honor lock with treasury subsidy", async () => {
  const f = await bookingFixture();
  f.ports.inventory.update(f.key, (r) => ({
    ...r,
    state: { ...r.state, F: r.state.F * 2 },
  }));
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const trip = await f.cases.createBooking(f.request, f.user);
  expect(trip.total?.micros).toBe(f.quote.total?.micros);
  expect(
    before - (await f.ports.walletProvider.balance(f.user.walletAddress)),
  ).toBe(f.quote.total?.micros ?? 0n);
});
test("trader ask fills reduce escrow and transfer seller net", async () => {
  const f = await bookingFixture();
  const seller = await f.ports.walletProvider.linkWallet("seller");
  f.ports.inventory.update(f.key, (r) => ({
    ...r,
    state: { ...r.state, traderAsks: [{ who: seller, price: 1, size: 0.5 }] },
  }));
  const before = await f.ports.walletProvider.balance(seller);
  await f.cases.createBooking(f.request, f.user);
  expect(f.ports.inventory.get(f.key).state.traderAsks).toHaveLength(0);
  expect(await f.ports.walletProvider.balance(seller)).toBeGreaterThan(before);
  expect(f.ports.activity.list({ kinds: ["ask_filled"] })).toHaveLength(1);
});

test("lower live prices reduce the locked charge", async () => {
  const f = await bookingFixture();
  f.ports.inventory.update(f.key, (r) => ({
    ...r,
    state: { ...r.state, F: r.state.F / 2 },
  }));
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const trip = await f.cases.createBooking(f.request, f.user);
  expect(trip.total?.micros ?? 0n).toBeLessThan(f.quote.total?.micros ?? 0n);
  expect(
    before - (await f.ports.walletProvider.balance(f.user.walletAddress)),
  ).toBe(trip.total?.micros ?? 0n);
});

test("concurrent attempts cannot consume the same lock twice", async () => {
  const f = await bookingFixture();
  const results = await Promise.allSettled([
    f.cases.createBooking(f.request, f.user),
    f.cases.createBooking(f.request, f.user),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(f.cases.listTrips(f.user.id).upcoming).toHaveLength(1);
});

test("parallel distinct locks with funds for one booking reserve only one stay", async () => {
  const f = await bookingFixture();
  const second = f.cases.lockQuote(
    f.cases.quoteStay(f.selection).id,
    f.user.id,
  );
  const before = f.ports.inventory.get(f.key);
  const wallet = f.ports.walletProvider;
  await wallet.transfer(
    f.user.walletAddress,
    "pool",
    (await wallet.balance(f.user.walletAddress)) -
      (f.quote.total?.micros ?? 0n),
    "test funding",
  );
  const results = await Promise.all([
    f.cases.createBooking(f.request, f.user).then(
      () => true,
      () => false,
    ),
    f.cases.createBooking({ ...f.request, lockId: second.id }, f.user).then(
      () => true,
      () => false,
    ),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(f.ports.inventory.get(f.key).state.booked).toBe(
    before.state.booked + 1,
  );
  expect(f.ports.inventory.get(f.key)).toEqual(
    fillNight(before, routeNight(before, 1), 1),
  );
  expect(await wallet.balance(f.user.walletAddress)).toBe(0n);
  expect(f.repo.trips.size).toBe(1);
  expect(f.repo.locks.get(second.id)?.busy).toBe(false);
  expect(f.ports.activity.list({ kinds: ["guest_booked"] })).toHaveLength(2);
});

test("failed card settlement restores nights and lock while retaining onramp credit", async () => {
  const f = await bookingFixture();
  const before = f.ports.inventory.get(f.key);
  const wallet = f.ports.walletProvider;
  const balance = await wallet.balance(f.user.walletAddress);
  wallet.settle = async () => {
    throw new Error("settlement failed");
  };
  await expect(
    f.cases.createBooking({ ...f.request, payMethod: PayMethod.CARD }, f.user),
  ).rejects.toThrow("settlement failed");
  expect(f.ports.inventory.get(f.key)).toEqual(before);
  expect(await wallet.balance(f.user.walletAddress)).toBe(
    balance + (f.quote.total?.micros ?? 0n),
  );
  expect(f.repo.locks.get(f.lock.id)?.busy).toBe(false);
  expect(f.repo.trips.size).toBe(0);
  expect(f.ports.activity.list({ kinds: ["guest_booked"] })).toHaveLength(0);
});
