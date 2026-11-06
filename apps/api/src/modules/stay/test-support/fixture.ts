import { create } from "@bufbuild/protobuf";
import { CreateBookingRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import {
  PayMethod,
  StaySelectionSchema,
  TripSchema,
} from "@night-shares/proto/stay/v1/trip_pb";
import { buildContainer } from "../../../container/build-container";
import { createMemoryStayRepo } from "../repo/stay-repo.memory";
import { createStayCases } from "../use-cases/create-stay-cases";
export function fixture() {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
  });
  const repo = createMemoryStayRepo();
  const cases = createStayCases(ports, repo);
  const selection = create(StaySelectionSchema, {
    propertyId: "prop_velana",
    roomTypeId: "rt_velana_0",
    checkIn: "2026-12-04",
    checkOut: "2026-12-06",
    adults: 2,
    rooms: 1,
  });
  const key = `prop_velana:rt_velana_0:${selection.checkIn}`;
  return { ports, repo, cases, selection, key };
}
export async function bookingFixture() {
  const f = fixture();
  const user = {
    id: "usr_guest",
    humanId: "guest",
    level: "device" as const,
    walletAddress: await f.ports.walletProvider.linkWallet("guest"),
  };
  // Remove seeded asks so these tests isolate pool settlement from the missing shared market-maker wallet.
  for (const date of ["2026-12-04", "2026-12-05"])
    f.ports.inventory.update(`prop_velana:rt_velana_0:${date}`, (r) => ({
      ...r,
      state: { ...r.state, traderAsks: [] },
    }));
  const quote = f.cases.quoteStay(f.selection);
  const lock = f.cases.lockQuote(quote.id, user.id);
  const request = create(CreateBookingRequestSchema, {
    lockId: lock.id,
    guestName: "Test Guest",
    guestEmail: "guest@example.test",
    payMethod: PayMethod.USDC,
  });
  return { ...f, user, quote, lock, request };
}
export function tripFixture() {
  const f = fixture();
  const trip = create(TripSchema, {
    ...f.selection,
    $typeName: undefined,
    id: "bk_test",
    total: { micros: 100n },
    fee: { micros: 2n },
  });
  f.repo.trips.set(trip.id, {
    trip,
    userId: "guest",
    guestName: "Private",
    guestEmail: "private@example.test",
    walletAddress: "wallet",
    paidAt: f.ports.clock.now(),
  });
  return { ...f, trip };
}
