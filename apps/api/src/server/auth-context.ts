import { createContextKey, type HandlerContext } from "@connectrpc/connect";
import type { User } from "../ports/sessions/session-store";
import { DomainError } from "../shared/errors/domain-error";
export const userKey = createContextKey<User | undefined>(undefined, {
  description: "Authenticated session user",
});
export function optionalUser(
  ctx: Pick<HandlerContext, "values">,
): User | undefined {
  return ctx.values.get(userKey);
}
export function requireUser(ctx: Pick<HandlerContext, "values">): User {
  const user = optionalUser(ctx);
  if (!user) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.");
  return user;
}
