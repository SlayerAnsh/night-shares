import type { Ports } from "../../../../container/ports";
import type { IdentityProof } from "../../../../ports/identity-verifier/identity-verifier";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { UserRepo } from "../../repo/user-repo";

export function createCompleteSignIn(
  deps: Pick<
    Ports,
    "identityVerifier" | "walletProvider" | "ids" | "sessions"
  > & { repo: UserRepo },
) {
  const pending = new Map<string, Promise<User>>();
  async function findOrCreate(humanId: string): Promise<User> {
    const existing = deps.repo.get(humanId);
    if (existing) return existing;
    const active = pending.get(humanId);
    if (active) return active;
    const creating = (async () => {
      const walletAddress = await deps.walletProvider.linkWallet(humanId);
      const user: User = {
        id: deps.ids.next("usr"),
        humanId,
        walletAddress,
        level: "device",
      };
      deps.repo.save(user);
      return user;
    })();
    pending.set(humanId, creating);
    try {
      return await creating;
    } finally {
      pending.delete(humanId);
    }
  }
  return async (input: { requestId: string; proof: IdentityProof }) => {
    if (!input.requestId.trim())
      throw new DomainError(
        "INVALID_ARGUMENT",
        "A sign-in request is required.",
      );
    const verified = await deps.identityVerifier.verifyProof({
      ...input,
      action: "sign_in",
    });
    const found = await findOrCreate(verified.subject);
    const user = deps.repo.get(found.humanId) ?? found;
    if (verified.level === "orb") user.level = "orb";
    deps.repo.save(user);
    return { sessionToken: deps.sessions.create(user), user };
  };
}
