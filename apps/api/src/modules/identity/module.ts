import { IdentityService } from "@night-shares/proto/identity/v1/identity_pb";
import type { Ports } from "../../container/ports";
import { createIdentityHandler } from "./identity.handler";
import { createMemoryUserRepo } from "./repo/user-repo.memory";
import { createSignOut } from "./use-cases/session/sign-out";
import { createCompleteSignIn } from "./use-cases/sign-in/complete-sign-in";
import { createStartSignIn } from "./use-cases/sign-in/start-sign-in";
import { createVerifyAction } from "./use-cases/verify-action";
export function createIdentityModule(ports: Ports) {
  const repo = createMemoryUserRepo();
  const handler = createIdentityHandler({
    startSignIn: createStartSignIn(ports),
    completeSignIn: createCompleteSignIn({ ...ports, repo }),
    signOut: createSignOut(ports),
    verifyAction: createVerifyAction(ports),
  });
  return { service: IdentityService, handler };
}
