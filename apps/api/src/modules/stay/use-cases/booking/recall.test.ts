import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { CreateBookingRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import { createSqliteMarketRepo } from "../../../market/repo/market-repo.sqlite";
import { fixture } from "../../test-support/fixture";

async function recallFixture(rooms = 4) {
  const f = fixture();
  f.selection.checkOut = "2026-12-05";
  f.selection.rooms = rooms;
  const market = createSqliteMarketRepo(f.ports.db);
  async function holder(name: string, size: number) {
    const user = {
      id: `usr_${name}`,
      humanId: name,
      level: "orb" as const,
      walletAddress: await f.ports.walletProvider.linkWallet(name),
    };
    market.remember(user);
    const position = market.position(name, f.key);
    position.free = size;
    position.average = 100000000n;
    return { user, position };
  }
  const small = await holder("small", 20);
  const large = await holder("large", 30);
  const user = {
    id: "usr_guest",
    humanId: "guest",
    level: "device" as const,
    walletAddress: await f.ports.walletProvider.linkWallet("guest"),
  };
  f.ports.inventory.update(f.key, (record) => ({
    ...record,
    state: {
      ...record.state,
      F: 100,
      k: 0,
      S: 10,
      q: 10,
      held: 5,
      booked: 5,
      traderAsks: [],
    },
  }));
  const quote = f.cases.quoteStay(f.selection);
  const lock = f.cases.lockQuote(quote.id, user.id);
  const request = create(CreateBookingRequestSchema, {
    lockId: lock.id,
    guestName: "Recall Guest",
    guestEmail: "recall@example.test",
  });
  return { ...f, market, small, large, user, request, lock };
}

test("booking recalls largest human first and pays strike minus the seller fee", async () => {
  const f = await recallFixture();
  try {
    const wallet = f.ports.walletProvider;
    const smallBefore = await wallet.balance(f.small.user.walletAddress);
    const largeBefore = await wallet.balance(f.large.user.walletAddress);
    const guestBefore = await wallet.balance(f.user.walletAddress);
    const trip = await f.cases.createBooking(f.request, f.user);
    expect(await wallet.balance(f.large.user.walletAddress)).toBe(
      largeBefore + 370125000n,
    );
    expect(await wallet.balance(f.small.user.walletAddress)).toBe(
      smallBefore + 123375000n,
    );
    expect(await wallet.balance(f.user.walletAddress)).toBe(
      guestBefore - 506500000n,
    );
    expect(trip.total?.micros).toBe(506500000n);
    expect(f.large.position.free).toBe(0);
    expect(f.small.position.free).toBe(10);
    expect(f.ports.inventory.get(f.key).state).toMatchObject({
      booked: 9,
      held: 1,
      q: 10,
    });
  } finally {
    f.ports.db.close();
  }
});

test("sold-out booking rejects without changing positions, inventory or payment", async () => {
  const f = await recallFixture();
  try {
    f.ports.inventory.update(f.key, (record) => ({
      ...record,
      state: { ...record.state, booked: 10, held: 0 },
    }));
    f.small.position.free = 0;
    f.large.position.free = 0;
    const before = f.ports.inventory.get(f.key);
    const balance = await f.ports.walletProvider.balance(f.user.walletAddress);
    await expect(
      f.cases.createBooking(f.request, f.user),
    ).rejects.toMatchObject({
      code: "FAILED_PRECONDITION",
      message: "This night is sold out.",
    });
    expect(f.ports.inventory.get(f.key)).toEqual(before);
    expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
      balance,
    );
    expect(f.small.position.free + f.large.position.free).toBe(0);
    expect(f.repo.trips.size).toBe(0);
  } finally {
    f.ports.db.close();
  }
});

function listAboveStrike(f: Awaited<ReturnType<typeof recallFixture>>) {
  f.large.position.free = 0;
  f.large.position.escrow = 30;
  f.large.position.askPrice = 200000000n;
  f.ports.inventory.update(f.key, (record) => ({
    ...record,
    state: {
      ...record.state,
      traderAsks: [{ who: f.large.user.walletAddress, price: 200, size: 3 }],
    },
  }));
}

test("recall cancels holder escrow asks priced above the strike", async () => {
  const f = await recallFixture();
  try {
    listAboveStrike(f);
    await f.cases.createBooking(f.request, f.user);
    expect(f.large.position.escrow).toBe(0);
    expect(f.large.position.realised).toBe(70125000n);
    expect(f.ports.inventory.get(f.key).state.traderAsks).toEqual([]);
    expect(f.small.position.free).toBe(10);
  } finally {
    f.ports.db.close();
  }
});

test("failed settlement restores recalled positions, above-strike listings and inventory", async () => {
  const f = await recallFixture();
  try {
    listAboveStrike(f);
    const before = f.ports.inventory.get(f.key);
    const large = { ...f.large.position };
    const small = { ...f.small.position };
    const balance = await f.ports.walletProvider.balance(f.user.walletAddress);
    f.ports.walletProvider.settle = async () => {
      throw new Error("settlement failed");
    };
    await expect(f.cases.createBooking(f.request, f.user)).rejects.toThrow(
      "settlement failed",
    );
    expect(f.ports.inventory.get(f.key)).toEqual(before);
    expect({ ...f.large.position }).toEqual(large);
    expect({ ...f.small.position }).toEqual(small);
    expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
      balance,
    );
    expect(f.repo.locks.get(f.lock.id)?.busy).toBe(false);
    expect(f.repo.trips.size).toBe(0);
  } finally {
    f.ports.db.close();
  }
});

test("trader asks already filled cannot also supply guest recall", async () => {
  const f = await recallFixture(1);
  try {
    f.small.position.free = 0;
    f.small.position.escrow = 5;
    f.small.position.askPrice = 100000000n;
    f.large.position.free = 0;
    f.ports.inventory.update(f.key, (record) => ({
      ...record,
      state: {
        ...record.state,
        held: 0.5,
        booked: 9.5,
        traderAsks: [
          { who: f.small.user.walletAddress, price: 100, size: 0.5 },
        ],
      },
    }));
    const before = f.ports.inventory.get(f.key);
    await expect(f.cases.createBooking(f.request, f.user)).rejects.toThrow(
      "This night is sold out.",
    );
    expect(f.ports.inventory.get(f.key)).toEqual(before);
    expect(f.small.position.escrow).toBe(5);
    expect(f.repo.trips.size).toBe(0);
  } finally {
    f.ports.db.close();
  }
});

test("booking combines an ordinary ask fill with recall of remaining holdings", async () => {
  const f = await recallFixture();
  try {
    f.small.position.free = 10;
    f.small.position.escrow = 10;
    f.small.position.askPrice = 100000000n;
    f.ports.inventory.update(f.key, (record) => ({
      ...record,
      state: {
        ...record.state,
        traderAsks: [{ who: f.small.user.walletAddress, price: 100, size: 1 }],
      },
    }));
    const wallet = f.ports.walletProvider;
    const smallBefore = await wallet.balance(f.small.user.walletAddress);
    const largeBefore = await wallet.balance(f.large.user.walletAddress);
    const trip = await f.cases.createBooking(f.request, f.user);
    expect(trip.total?.micros).toBe(481175000n);
    expect(await wallet.balance(f.small.user.walletAddress)).toBe(
      smallBefore + 98700000n,
    );
    expect(await wallet.balance(f.large.user.walletAddress)).toBe(
      largeBefore + 370125000n,
    );
    expect(f.small.position.escrow).toBe(0);
    expect(f.small.position.free).toBe(10);
    expect(f.large.position.free).toBe(0);
    expect(f.ports.inventory.get(f.key).state.traderAsks).toEqual([]);
  } finally {
    f.ports.db.close();
  }
});
