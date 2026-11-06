import type { User } from "../../../../ports/sessions/session-store";
import { card } from "../../mappers/analytics/card";
import type { Deps } from "../context";
export function listWatch(deps: Deps, user: User) {
  return {
    nights: [...deps.repo.account(user.humanId).watch].map(
      (key) => card(deps.ports, deps.ports.inventory.get(key)).card,
    ),
  };
}
