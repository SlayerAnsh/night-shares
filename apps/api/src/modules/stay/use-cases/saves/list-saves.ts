import type { Ports } from "../../../../container/ports";
import type { StayRepo } from "../../repo/stay-repo";
export function createListSaves(ports: Ports, repo: StayRepo) {
  return (userId: string) =>
    ports.catalog.list().filter((p) => repo.saves.get(userId)?.has(p.id));
}
