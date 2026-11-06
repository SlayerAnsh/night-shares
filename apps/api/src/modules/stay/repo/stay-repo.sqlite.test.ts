import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { CreateBookingRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import { StaySelectionSchema } from "@night-shares/proto/stay/v1/trip_pb";
import { buildContainer } from "../../../container/build-container";
import { createStayCases } from "../use-cases/create-stay-cases";
import { createSqliteStayRepo } from "./stay-repo.sqlite";

function setup(path = ":memory:") {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
    dbPath: path,
  });
  const repo = createSqliteStayRepo(ports.db);
  const cases = createStayCases(ports, repo);
  const selection = create(StaySelectionSchema, {
    propertyId: "prop_velana",
    roomTypeId: "rt_velana_0",
    checkIn: "2026-12-04",
    checkOut: "2026-12-06",
    adults: 2,
    rooms: 1,
  });
  const keys = ["2026-12-04", "2026-12-05"].map(
    (date) => `prop_velana:rt_velana_0:${date}`,
  );
  return { ports, repo, cases, selection, keys };
}

async function prepare(f: ReturnType<typeof setup>) {
  for (const key of f.keys)
    f.ports.inventory.update(key, (record) => ({
      ...record,
      state: { ...record.state, traderAsks: [] },
    }));
  const user = {
    id: "usr_guest",
    humanId: "guest",
    level: "device" as const,
    walletAddress: await f.ports.walletProvider.linkWallet("guest"),
  };
  const quote = f.cases.quoteStay(f.selection);
  const lock = f.cases.lockQuote(quote.id, user.id);
  const request = create(CreateBookingRequestSchema, {
    lockId: lock.id,
    guestName: "Private Guest",
    guestEmail: "private@example.test",
  });
  return { user, quote, lock, request };
}

test("quotes, locks, checked-in trips, receipts and saves survive a file database restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stay-restart-"));
  const path = join(directory, "stay.db");
  let f = setup(path);
  try {
    const { user, quote, lock, request } = await prepare(f);
    const pending = f.cases.lockQuote(quote.id, user.id);
    const trip = await f.cases.createBooking(request, user);
    const { token } = f.ports.verifications.issue({
      userId: user.id,
      action: "check_in",
      resourceId: trip.id,
    });
    f.cases.checkIn(trip.id, token, user.id);
    f.cases.toggleSave("prop_velana", user.id);
    const receipt = f.cases.getReceipt(trip.id, user.id);
    // Exercise INTEGER precision beyond JavaScript's safe integer range.
    quote.total = {
      $typeName: "night_shares.common.v1.Usdc",
      micros: 9_007_199_254_740_993n,
    };
    f.repo.quotes.set(quote.id, quote);
    const row = f.ports.db
      .query<{ snapshot: string; guest_name: string; guest_email: string }, []>(
        "SELECT snapshot, guest_name, guest_email FROM stay_trips",
      )
      .get();
    expect(row?.guest_name).toBe(request.guestName);
    expect(row?.guest_email).toBe(request.guestEmail);
    expect(row?.snapshot).not.toContain(request.guestName);
    expect(row?.snapshot).not.toContain(request.guestEmail);
    f.ports.db.close();
    f = setup(path);
    expect(f.repo.quotes.get(quote.id)).toEqual(quote);
    expect(f.repo.locks.get(pending.id)).toEqual(pending);
    expect(f.repo.locks.get(lock.id)?.tripId).toBe(trip.id);
    expect(f.repo.locks.get(lock.id)?.busy).toBe(false);
    expect(f.cases.getReceipt(trip.id, user.id)).toEqual(receipt);
    expect(f.cases.listTrips(user.id).upcoming[0]?.checkedIn).toBe(true);
    expect(f.cases.listTrips("other").upcoming).toEqual([]);
    expect(f.cases.listSaves(user.id).map((p) => p.id)).toEqual([
      "prop_velana",
    ]);
    expect(f.cases.toggleSave("prop_velana", user.id)).toBe(false);
    await expect(f.cases.createBooking(request, user)).rejects.toThrow(
      "Quote lock is unavailable",
    );
  } finally {
    f.ports.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed settlement restores all nights and releases the persisted lock", async () => {
  const f = setup();
  try {
    const { user, lock, request } = await prepare(f);
    const before = f.keys.map((key) => f.ports.inventory.get(key));
    f.ports.walletProvider.settle = async () => {
      expect(f.repo.locks.get(lock.id)?.busy).toBe(true);
      throw new Error("Settlement failed");
    };
    await expect(f.cases.createBooking(request, user)).rejects.toThrow(
      "Settlement failed",
    );
    expect(f.keys.map((key) => f.ports.inventory.get(key))).toEqual(before);
    expect(f.repo.locks.get(lock.id)?.busy).toBe(false);
    expect(f.repo.trips.size).toBe(0);
  } finally {
    f.ports.db.close();
  }
});

test("failed lock write rolls back every reserved night", async () => {
  const f = setup();
  try {
    const { user, request } = await prepare(f);
    const before = f.keys.map((key) => f.ports.inventory.get(key));
    f.ports.db.exec(`CREATE TRIGGER reject_busy BEFORE UPDATE ON stay_locks
      WHEN NEW.busy = 1 BEGIN SELECT RAISE(ABORT, 'Lock write failed'); END;`);
    await expect(f.cases.createBooking(request, user)).rejects.toThrow(
      "Lock write failed",
    );
    expect(f.keys.map((key) => f.ports.inventory.get(key))).toEqual(before);
    expect(f.repo.locks.get(request.lockId)?.busy).toBe(false);
  } finally {
    f.ports.db.close();
  }
});
