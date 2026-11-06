import { createHash, randomBytes } from "node:crypto";
import type { SessionStore, User } from "./session-store";

// Tokens are 256 bit random values, never derived from sequential ids, so
// they cannot be guessed. Only a SHA-256 hash of each token is kept.
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<string, User>();
  return {
    create(user) {
      const token = randomBytes(32).toString("base64url");
      sessions.set(hashToken(token), { ...user });
      return token;
    },
    get(token) {
      const user = sessions.get(hashToken(token));
      return user && { ...user };
    },
    delete(token) {
      sessions.delete(hashToken(token));
    },
  };
}
