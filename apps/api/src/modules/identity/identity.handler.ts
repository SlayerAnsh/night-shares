import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { ServiceImpl } from "@connectrpc/connect";
import type { IdentityService } from "@night-shares/proto/identity/v1/identity_pb";
import { requireUser } from "../../server/auth-context";
import { fromAction, fromLevel, toUser } from "./mappers/identity";
import { fromProof } from "./mappers/proof";
import { getSession } from "./use-cases/session/get-session";
import type { createSignOut } from "./use-cases/session/sign-out";
import type { createCompleteSignIn } from "./use-cases/sign-in/complete-sign-in";
import type { createStartSignIn } from "./use-cases/sign-in/start-sign-in";
import type { createStartVerifyAction } from "./use-cases/start-verify-action";
import type { createVerifyAction } from "./use-cases/verify-action";
export function createIdentityHandler(cases: {
  startVerifyAction: ReturnType<typeof createStartVerifyAction>;
  startSignIn: ReturnType<typeof createStartSignIn>;
  completeSignIn: ReturnType<typeof createCompleteSignIn>;
  signOut: ReturnType<typeof createSignOut>;
  verifyAction: ReturnType<typeof createVerifyAction>;
}): ServiceImpl<typeof IdentityService> {
  return {
    async startSignIn(req) {
      const result = await cases.startSignIn(fromLevel(req.level));
      return { ...result, expiresAt: timestampFromMs(result.expiresAt) };
    },
    async startVerifyAction(req, ctx) {
      const result = await cases.startVerifyAction(
        requireUser(ctx),
        fromAction(req.action),
      );
      return { ...result, expiresAt: timestampFromMs(result.expiresAt) };
    },
    async completeSignIn(req) {
      const result = await cases.completeSignIn({
        requestId: req.requestId,
        proof: fromProof(req.proof),
      });
      return { sessionToken: result.sessionToken, user: toUser(result.user) };
    },
    getSession(_req, ctx) {
      return { user: toUser(getSession(requireUser(ctx))) };
    },
    signOut(_req, ctx) {
      cases.signOut(
        /^Bearer ([^\s]+)$/i.exec(
          ctx.requestHeader.get("authorization") ?? "",
        )?.[1],
      );
      return {};
    },
    async verifyAction(req, ctx) {
      const result = await cases.verifyAction(
        requireUser(ctx),
        fromAction(req.action),
        fromProof(req.proof),
        req.requestId,
      );
      return {
        verificationToken: result.token,
        expiresAt: timestampFromMs(result.expiresAt),
      };
    },
  };
}
