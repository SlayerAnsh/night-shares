import type { Ports } from "../../../../container/ports";
import { DomainError } from "../../../../shared/errors/domain-error";
export function createSignOut(deps: Pick<Ports, "sessions">) {
  return (token: string | undefined) => {
    if (!token)
      throw new DomainError("UNAUTHENTICATED", "Sign in to continue.");
    deps.sessions.delete(token);
  };
}
