import type { User } from "../../../ports/sessions/session-store";
export interface UserRepo {
  get(humanId: string): User | undefined;
  save(user: User): void;
}
