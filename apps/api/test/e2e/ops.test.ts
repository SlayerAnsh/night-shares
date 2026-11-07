import { expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { createHarness } from "./harness";

test("enabled IP limit rejects excess RPCs but leaves probes available", async () => {
  const h = await createHarness(undefined, {
    rateLimitEnabled: true,
    rateLimitPerIp: 1,
  });
  try {
    for (const path of ["/healthz", "/readyz"]) {
      const response = await fetch(`${h.baseUrl}${path}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ok",
        ...(path === "/readyz" ? { executionEnabled: false } : {}),
      });
    }
    await h.clients.catalog.listDestinations({});
    for (const path of ["/healthz", "/readyz", "/healthz"]) {
      // Connect sends a chunked POST body. Probe immediately after rejection
      // to catch a pooled socket retaining unread request framing.
      await expect(
        h.clients.catalog.listDestinations({ text: "Paris" }),
      ).rejects.toMatchObject({ code: Code.ResourceExhausted });
      const response = await fetch(`${h.baseUrl}${path}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ok",
        ...(path === "/readyz" ? { executionEnabled: false } : {}),
      });
    }
  } finally {
    await h.close();
  }
});

test("readiness detects missing migrations while liveness remains healthy", async () => {
  const h = await createHarness();
  try {
    h.container.ports.db.exec(
      "DELETE FROM schema_migrations WHERE version = 1",
    );
    expect((await fetch(`${h.baseUrl}/readyz`)).status).toBe(503);
    expect((await fetch(`${h.baseUrl}/healthz`)).status).toBe(200);
  } finally {
    await h.close();
  }
});

test("body limits and configured CORS apply before RPC dispatch", async () => {
  const h = await createHarness(undefined, {
    maxRequestBodyBytes: 32,
    corsOrigins: ["https://example.test"],
  });
  try {
    const response = await fetch(
      `${h.baseUrl}/night_shares.catalog.v1.CatalogService/ListDestinations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
        },
        body: JSON.stringify({ text: "x".repeat(64) }),
      },
    );
    expect(response.status).toBe(413);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://example.test",
    );
    expect((await response.json()).code).toBe("resource_exhausted");
    const denied = await fetch(`${h.baseUrl}/healthz`, {
      headers: { origin: "https://untrusted.test" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  } finally {
    await h.close();
  }
});

test("request deadline ends stalled handlers while drain waits for completion", async () => {
  const h = await createHarness(undefined, { requestTimeoutMs: 100 });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Routes capture the module implementation at server construction, so use a
  // pending wallet operation reached through the existing handler instead.
  const original = h.container.ports.walletProvider.balance;
  h.container.ports.walletProvider.balance = async () => {
    await gate;
    return 0n;
  };
  try {
    const session = await h.signInAs("device", "deadline");
    await expect(session.clients.wallet.getBalance({})).rejects.toMatchObject({
      code: Code.DeadlineExceeded,
    });
  } finally {
    release();
    await h.server.drain();
    h.container.ports.walletProvider.balance = original;
    await h.close();
  }
});
