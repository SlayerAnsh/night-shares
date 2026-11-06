import type { User } from "../../../../ports/sessions/session-store";
import type { Deps } from "../context";
export function toggleWatch(deps: Deps, user: User, key: string) {
  deps.ports.inventory.get(key);
  const watch = deps.repo.account(user.humanId).watch;
  const isWatched = !watch.has(key);
  if (isWatched) watch.add(key);
  else watch.delete(key);
  return { isWatched };
}
