import type { User } from "../../../../ports/sessions/session-store";
export function getSession(user: User): User {
  return { ...user };
}
