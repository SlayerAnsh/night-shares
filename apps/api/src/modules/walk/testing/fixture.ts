import { create } from "@bufbuild/protobuf";
import { TripSchema } from "@night-shares/proto/stay/v1/trip_pb";
import { buildContainer } from "../../../container/build-container";
import type { MockClock } from "../../../ports/clock/clock.mock";
import { payoutOf } from "../../host/mappers/payout";
import { createSqliteStayRepo } from "../../stay/repo/stay-repo.sqlite";
import { createStayCases } from "../../stay/use-cases/create-stay-cases";
import { adjustCoverAccount } from "../repo/cover-accounts";

export async function fixture(pending = 6000n) {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    devTagIssuer: true,
    dbPath: ":memory:",
    today: "2026-12-04",
  });
  const clock = ports.clock as MockClock;
  clock.set(Date.parse("2026-12-04T15:00:00Z"));
  const repo = createSqliteStayRepo(ports.db);
  const user = {
    id: "usr_guest",
    humanId: "guest",
    walletAddress: await ports.walletProvider.linkWallet("guest"),
  };
  const trip = create(TripSchema, {
    id: "bk_test",
    propertyId: "prop_velana",
    roomTypeId: "rt_velana_0",
    checkIn: "2026-12-04",
    checkOut: "2026-12-06",
    rooms: 1,
    total: { micros: 10000n },
  });
  repo.trips.set(trip.id, {
    trip,
    userId: user.id,
    walletAddress: user.walletAddress,
    guestName: "Guest",
    guestEmail: "guest@example.test",
    paidAt: clock.now() - 86400000,
  });
  const key = `${trip.propertyId}:${trip.roomTypeId}:${trip.checkIn}`;
  ports.inventory.get(key);
  const gross = payoutOf(ports.inventory.list({ propertyId: trip.propertyId }))
    .availableNow.micros;
  adjustCoverAccount(ports.db, trip.propertyId, gross - pending, 0n);
  ports.db
    .query(
      "INSERT INTO host_sweeps (id, property_id, amount, debt, at, status) VALUES ('fixture', ?, 0, 0, 0, 'settled')",
    )
    .run(trip.propertyId);
  ports.db
    .query("INSERT INTO host_sweep_nights VALUES ('fixture', ?, ?, 0)")
    .run(
      key,
      payoutOf([ports.inventory.get(key)]).availableNow.micros - pending,
    );
  const cases = createStayCases(ports, repo);
  const report = {
    id: "walk_test",
    bookingId: trip.id,
    userId: user.id,
    humanId: user.humanId,
    reportedAt: clock.now(),
  };
  return { ports, repo, user, trip, clock, cases, report, key };
}
