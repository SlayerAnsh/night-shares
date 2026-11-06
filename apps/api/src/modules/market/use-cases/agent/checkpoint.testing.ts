import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import { fixture } from "../../testing/fixture";
import { createAgentOrder } from "../account/create-agent-order";
import { startAgentCheckpoint } from "./start-checkpoint";
import { fundFixtureAgent } from "./testing";
export async function checkpointFixture() {
  const d = await fixture();
  await fundFixtureAgent(d);
  d.key = "prop_velana:rt_velana_0:2026-12-20";
  const { order } = await createAgentOrder(
    d,
    d.user,
    d.key,
    5,
    10_000_000_000n,
  );
  const token = d.ports.sessions.create(d.user);
  const settings = agentPassSettings(d.ports);
  settings.store.enroll(
    d.user.id,
    settings.config.agentPassIssuer,
    `mock:${d.user.id}`,
  );
  const started = await startAgentCheckpoint(d, d.user, order.id, token);
  const a = settings.store.get(started.attemptId ?? "");
  if (!a) throw new Error("Missing attempt");
  a.browser = "test-browser";
  settings.store.save(a);
  const callback = { state: a.state, browser: a.browser, code: "approve" };
  return { ...d, ...settings, order, a, callback, token, started };
}
