import { afterEach, expect, test } from "bun:test";
import { timestampMs } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import { VerificationLevel } from "@night-shares/proto/identity/v1/user_pb";
import { createHarness } from "./harness";

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

test("World ID sign-in, wallet, fresh action proof and sign-out complete the guest flow", async () => {
  const h = await createHarness();
  harness = h;
  const request = await h.clients.identity.startSignIn({
    level: VerificationLevel.DEVICE,
  });
  expect(request.qrPayload).toContain(request.requestId);
  expect(request.expiresAt).toBeDefined();
  const session = await h.clients.identity.completeSignIn({
    requestId: request.requestId,
    proof: { case: "mockProof", value: "mock:guest:device" },
  });
  const clients = h.clientsFor(session.sessionToken);
  expect((await clients.identity.getSession({})).user).toEqual(session.user);
  expect((await clients.wallet.getBalance({})).balance?.micros).toBe(
    12480000000n,
  );
  const fresh = await clients.identity.startVerifyAction({
    action: "check_in",
  });
  const verification = await clients.identity.verifyAction({
    requestId: fresh.requestId,
    action: "check_in",
    proof: { case: "mockProof", value: "mock:guest:device" },
  });
  expect(verification.verificationToken).not.toBe("");
  expect(verification.expiresAt && timestampMs(verification.expiresAt)).toBe(
    h.container.ports.clock.now() + 300000,
  );
  expect(
    h.container.ports.verifications.consume({
      token: verification.verificationToken,
      userId: session.user?.id ?? "",
      action: "check_in",
    }),
  ).toBe(true);
  await clients.identity.signOut({});
  await expect(clients.identity.getSession({})).rejects.toMatchObject({
    code: Code.Unauthenticated,
  });
});

test("Device cannot call an Orb RPC; upgrading preserves the user and enables access", async () => {
  const h = await createHarness();
  harness = h;
  const device = await h.signIn("device", "upgrade");
  await expect(device.clients.market.listWatch({})).rejects.toMatchObject({
    code: Code.PermissionDenied,
  });
  const orb = await h.signIn("orb", "upgrade");
  expect(orb.user?.id).toBe(device.user?.id);
  expect(orb.user?.walletAddress).toBe(device.user?.walletAddress);
  expect(orb.user?.level).toBe(VerificationLevel.ORB);
  await orb.clients.market.listWatch({});
  const again = await h.signIn("device", "upgrade");
  expect(again.user?.level).toBe(VerificationLevel.ORB);
});

test("bad proofs are Unauthenticated and unknown action names are InvalidArgument", async () => {
  const h = await createHarness();
  harness = h;
  const request = await h.clients.identity.startSignIn({
    level: VerificationLevel.DEVICE,
  });
  await expect(
    h.clients.identity.completeSignIn({
      requestId: request.requestId,
      proof: { case: "mockProof", value: "bad" },
    }),
  ).rejects.toMatchObject({ code: Code.Unauthenticated });
  await expect(h.clients.identity.startSignIn({})).rejects.toMatchObject({
    code: Code.InvalidArgument,
  });
  const session = await h.signIn("device");
  await expect(
    session.clients.identity.verifyAction({
      action: "unknown",
      proof: { case: "mockProof", value: "mock:e2e:device" },
    }),
  ).rejects.toMatchObject({ code: Code.InvalidArgument });
  await expect(
    session.clients.identity.verifyAction({
      action: "check_in",
      requestId: (
        await session.clients.identity.startVerifyAction({ action: "check_in" })
      ).requestId,
      proof: { case: "mockProof", value: "mock:someone-else:device" },
    }),
  ).rejects.toMatchObject({ code: Code.PermissionDenied });
});

test("sign-out revokes only its bearer token", async () => {
  const h = await createHarness();
  harness = h;
  const first = await h.signIn("device"),
    second = await h.signIn("device");
  await first.clients.identity.signOut({});
  await expect(first.clients.identity.getSession({})).rejects.toMatchObject({
    code: Code.Unauthenticated,
  });
  expect((await second.clients.identity.getSession({})).user?.id).toBe(
    first.user?.id,
  );
});
