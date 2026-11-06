import type { StartSignInResponse } from "@night-shares/proto/identity/v1/identity_pb";
import type { AccessLevel } from "../session/access";
export interface WorldIdClient {
  start(level: AccessLevel): Promise<StartSignInResponse>;
}
