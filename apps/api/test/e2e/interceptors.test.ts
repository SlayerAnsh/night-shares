import { expect, test } from "bun:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { buildContainer } from "../../src/container/build-container";
import { optionalUser, requireUser } from "../../src/server/auth-context";
import {
  DomainError,
  type DomainErrorCode,
} from "../../src/shared/errors/domain-error";
import { createHarness } from "./harness";

test("auth context supplies users and the outer error interceptor maps domain codes", async () => {
  const container = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
  });
  let domainCode: DomainErrorCode = "NOT_FOUND";
  container.modules.catalog.handler.listDestinations = (_request, ctx) => {
    expect(optionalUser(ctx)).toBeUndefined();
    throw new DomainError(domainCode, "Readable domain error");
  };
  container.modules.wallet.handler.getBalance = (_request, ctx) => {
    expect(requireUser(ctx).id).toBe("usr_context");
    throw new ConnectError("Context reached", Code.Unimplemented);
  };
  const h = await createHarness(container);
  try {
    const cases: [DomainErrorCode, Code][] = [
      ["NOT_FOUND", Code.NotFound],
      ["INVALID_ARGUMENT", Code.InvalidArgument],
      ["FAILED_PRECONDITION", Code.FailedPrecondition],
      ["PERMISSION_DENIED", Code.PermissionDenied],
      ["UNAUTHENTICATED", Code.Unauthenticated],
      ["RESOURCE_EXHAUSTED", Code.ResourceExhausted],
    ];
    for (const [domain, connect] of cases) {
      domainCode = domain;
      await expect(
        h.clients.catalog.listDestinations({}),
      ).rejects.toMatchObject({
        code: connect,
        rawMessage: "Readable domain error",
      });
    }
    const token = container.ports.sessions.create({
      id: "usr_context",
      humanId: "context",
      level: "device",
      walletAddress: "mock",
    });
    await expect(
      h.clientsFor(token).wallet.getBalance({}),
    ).rejects.toMatchObject({
      code: Code.Unimplemented,
      rawMessage: "Context reached",
    });
  } finally {
    await h.close();
  }
});
