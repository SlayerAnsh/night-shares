import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { IdentityService } from "@night-shares/proto/identity/v1/identity_pb";
import type { Ports } from "../../container/ports";
export function createIdentityModule(_ports: Ports) {
  const notBuiltYet = (): never => {
    throw new ConnectError("not built yet", Code.Unimplemented);
  };
  const handler: ServiceImpl<typeof IdentityService> = {
    startSignIn: notBuiltYet,
    completeSignIn: notBuiltYet,
    getSession: notBuiltYet,
    signOut: notBuiltYet,
    verifyAction: notBuiltYet,
  };
  return { service: IdentityService, handler };
}
