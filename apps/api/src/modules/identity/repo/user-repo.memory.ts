import type { User } from "../../../ports/sessions/session-store";
import type { UserRepo } from "./user-repo";
export function createMemoryUserRepo(): UserRepo {
  const users = new Map<string, User>();
  return {
    get(humanId) {
      const user = users.get(humanId);
      return user && { ...user };
    },
    save(user) {
      users.set(user.humanId, { ...user });
    },
  };
}
