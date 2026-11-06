import type { Ports } from "../../../../container/ports";
import { handleReport } from "../../../walk/use-cases/handle-report";
import type { StayRepo } from "../../repo/stay-repo";

export function createReportWalk(ports: Ports, repo: StayRepo) {
  return (bookingId: string, user: { id: string; humanId: string }) =>
    handleReport(
      ports,
      {
        id: ports.ids.next("walk"),
        bookingId,
        userId: user.id,
        humanId: user.humanId,
        reportedAt: ports.clock.now(),
      },
      repo,
    );
}
