import { expect, test } from "bun:test";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { buildContainer } from "../container/build-container";
import { createSqliteMarketRepo } from "../modules/market/repo/market-repo.sqlite";
import { createAgentOrder } from "../modules/market/use-cases/account/create-agent-order";
import { startAgentCheckpoint } from "../modules/market/use-cases/agent/start-checkpoint";
import { fundFixtureAgent } from "../modules/market/use-cases/agent/testing";
import { agentPassSettings } from "../ports/agent-pass/settings";
import { createAgentPassRoute } from "./agent-pass-route";

test("HTTP route binds browser handoff, blocks copied callbacks and rejects replay without listening", async () => {
  const container = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
    clock: "mock",
    today: "2026-12-01",
  });
  const { ports } = container;
  const user = {
    id: "usr_test",
    humanId: "test",
    level: "orb" as const,
    walletAddress: await ports.walletProvider.linkWallet("test"),
  };
  const d = { ports, repo: createSqliteMarketRepo(ports.db), user };
  const route = createAgentPassRoute(container);
  async function call(path: string, cookie = "") {
    const req = new IncomingMessage(new Socket());
    req.method = "GET";
    req.url = path;
    req.headers = { cookie };
    const res = new ServerResponse(req);
    await route(req, res);
    req.destroy();
    return res;
  }
  try {
    await fundFixtureAgent(d);
    const { order } = await createAgentOrder(
      d,
      user,
      "prop_velana:rt_velana_0:2026-12-20",
      5,
      10_000_000_000n,
    );
    const token = ports.sessions.create(user);
    const settings = agentPassSettings(ports);
    settings.store.enroll(user.id, settings.config.agentPassIssuer, `mock:${user.id}`);
    const start = await startAgentCheckpoint(d, user, order.id, token);
    const url = new URL(start.authorizeUrl ?? "");
    const begin = await call(url.pathname + url.search);
    expect(begin.statusCode).toBe(303);
    const cookie = String(begin.getHeader("set-cookie")).split(";")[0] ?? "";
    expect((await call(url.pathname + url.search)).statusCode).toBe(403);
    const a = agentPassSettings(ports).store.get(start.attemptId ?? "");
    const callback = `/agent-pass/callback?state=${a?.state}&code=approve`;
    expect(String((await call(callback)).getHeader("location"))).toContain(
      "checkpoint=mismatch",
    );
    expect(
      String((await call(callback, cookie)).getHeader("location")),
    ).toContain("checkpoint=approved");
    expect(
      String((await call(callback, cookie)).getHeader("location")),
    ).toContain("checkpoint=mismatch");
  } finally {
    ports.db.close();
  }
});
