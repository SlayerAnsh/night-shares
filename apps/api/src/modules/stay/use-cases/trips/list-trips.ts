import type { Ports } from "../../../../container/ports";
import type { StayRepo } from "../../repo/stay-repo";
export function createListTrips(ports: Ports, repo: StayRepo) {
  return (userId: string) => {
    const trips = [...repo.trips.values()]
      .filter((s) => s.userId === userId)
      .map((s) => structuredClone(s.trip));
    return {
      upcoming: trips
        .filter((t) => t.checkOut >= ports.clock.today())
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
      past: trips
        .filter((t) => t.checkOut < ports.clock.today())
        .sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    };
  };
}
