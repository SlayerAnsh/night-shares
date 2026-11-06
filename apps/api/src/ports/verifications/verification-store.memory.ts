import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "../clock/clock";
import type { VerificationStore, VerifiedAction } from "./verification-store";

const TTL_MS = 5 * 60 * 1000;
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

type Entry = {
  userId: string;
  action: VerifiedAction;
  expiresAt: number;
  resourceId?: string;
};

export function createMemoryVerificationStore(deps: {
  clock: Clock;
}): VerificationStore {
  const entries = new Map<string, Entry>();
  return {
    issue({ userId, action, resourceId }) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = deps.clock.now() + TTL_MS;
      entries.set(hashToken(token), { userId, action, expiresAt, resourceId });
      return { token, expiresAt };
    },
    consume({ token, userId, action, resourceId }) {
      const key = hashToken(token);
      const entry = entries.get(key);
      if (!entry) return false;
      entries.delete(key);
      return (
        entry.userId === userId &&
        entry.action === action &&
        (entry.resourceId ?? "") === (resourceId ?? "") &&
        entry.expiresAt > deps.clock.now()
      );
    },
  };
}
