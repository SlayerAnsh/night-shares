import type { Ports } from "../../../../container/ports";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
export function createLockQuote(ports: Ports, repo: StayRepo) {
  return (quoteId: string, userId: string) => {
    const quote = repo.quotes.get(quoteId);
    if (!quote) throw new DomainError("NOT_FOUND", "Quote not found.");
    const lock = {
      id: ports.ids.next("lock"),
      userId,
      quote: structuredClone(quote),
      expiresAt: ports.clock.now() + 600_000,
      busy: false,
    };
    repo.locks.set(lock.id, lock);
    return lock;
  };
}
