import { useMutation } from "@connectrpc/connect-query";
import { startSignIn } from "@night-shares/proto/identity/v1/identity-IdentityService_connectquery";
import { VerificationLevel } from "@night-shares/proto/identity/v1/user_pb";
import type { WorldIdClient } from "./world-id-client";
export function useMockWorldIdClient(): WorldIdClient {
  const mutation = useMutation(startSignIn);
  return {
    start: (level, sessionId) =>
      mutation.mutateAsync({
        sessionId,
        level:
          level === "orb" ? VerificationLevel.ORB : VerificationLevel.DEVICE,
      }),
  };
}
