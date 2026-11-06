import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "../clock/clock";
import { createSystemClock } from "../clock/clock.system";
import type { SessionStore, User } from "./session-store";

// Tokens are 256 bit random values, never derived from sequential ids, so
// they cannot be guessed. Only a SHA-256 hash of each token is kept.
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function createMemorySessionStore(
  { clock }: { clock: Clock } = { clock: createSystemClock() },
): SessionStore {
  const sessions = new Map<string, { user: User; expiresAt: number }>();
  return {
    create(user) {
      const token = randomBytes(32).toString("base64url");
      sessions.set(hashToken(token), {
        user: { ...user },
        expiresAt: clock.now() + 7 * 86400000,
      });
      return token;
    },
    get(token) {
      const entry = sessions.get(hashToken(token));
      return entry && entry.expiresAt > clock.now()
        ? { ...entry.user }
        : undefined;
    },
    delete(token) {
      sessions.delete(hashToken(token));
    },
  };
}
