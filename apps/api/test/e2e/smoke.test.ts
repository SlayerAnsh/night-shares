import { afterAll, beforeAll, expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { createStubContainer } from "../fixtures/stub-container";
import { createHarness } from "./harness";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness(createStubContainer());
});
afterAll(async () => {
  await h.close();
});
test("server boots and serves health and all six API specifications", async () => {
  expect((await fetch(`${h.baseUrl}/healthz`)).status).toBe(200);
  const docs = await fetch(`${h.baseUrl}/docs`);
  expect(docs.status).toBe(200);
  const html = await docs.text();
  for (const name of [
    "identity",
    "catalog",
    "stay",
    "market",
    "host",
    "wallet",
  ]) {
    expect(html).toContain(`/docs/openapi/${name}.yaml`);
    const spec = await fetch(`${h.baseUrl}/docs/openapi/${name}.yaml`);
    expect(spec.status).toBe(200);
    expect(await spec.text()).toContain("openapi: 3.1");
  }
});
test("PUBLIC stub returns Unimplemented over HTTP/1.1 JSON", async () => {
  await expect(h.clients.catalog.listDestinations({})).rejects.toMatchObject({
    code: Code.Unimplemented,
    rawMessage: "not built yet",
  });
});
test("ORB stub requires a session based on its method option", async () => {
  await expect(h.clients.market.buy({})).rejects.toMatchObject({
    code: Code.Unauthenticated,
  });
});
test("DEVICE sessions cannot call ORB methods; valid levels reach stubs", async () => {
  for (const level of ["device", "orb"] as const) {
    const token = h.container.ports.sessions.create({
      id: `usr_${level}`,
      humanId: level,
      level,
      walletAddress: "mock",
    });
    const clients = h.clientsFor(token);
    await expect(clients.wallet.getBalance({})).rejects.toMatchObject({
      code: Code.Unimplemented,
    });
    await expect(clients.market.buy({})).rejects.toMatchObject({
      code: level === "orb" ? Code.Unimplemented : Code.PermissionDenied,
    });
    h.container.ports.sessions.delete(token);
    await expect(clients.wallet.getBalance({})).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
  }
});
test("CORS permits the frontend origin and its Connect preflight", async () => {
  const response = await fetch(
    `${h.baseUrl}/night_shares.catalog.v1.CatalogService/ListDestinations`,
    { method: "OPTIONS", headers: { origin: "http://localhost:3000" } },
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:3000",
  );
});

test("all 49 RPCs are registered and authenticated sessions reach every stub", async () => {
  const token = h.container.ports.sessions.create({
    id: "usr_all",
    humanId: "all",
    level: "orb",
    walletAddress: "mock",
  });
  let count = 0;
  for (const { service } of Object.values(h.container.modules)) {
    for (const method of service.methods) {
      const response = await fetch(
        `${h.baseUrl}/${service.typeName}/${method.name}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "connect-protocol-version": "1",
            authorization: `Bearer ${token}`,
          },
          body: "{}",
        },
      );
      expect(await response.json()).toMatchObject({
        code: "unimplemented",
        message: "not built yet",
      });
      count++;
    }
  }
  expect(count).toBe(49);
});
