import { expect, test } from "bun:test";
import { loadConfig } from "../../config/load-config";

test("checkpoint defaults and HTTPS confidential registration are validated at startup", () => {
  expect(loadConfig({}).agentPassMode).toBe("mock");
  expect(loadConfig({}).agentApproval).toBe("agent-pass");
  for (const env of [
    { AGENT_PASS_MODE: "bad" },
    { AGENT_APPROVAL: "bad" },
    { AGENT_PASS_MODE: "oidc" },
    { AGENT_PASS_ACR: "https://world.org/oidc/acr/selfie" },
    { WEB_ORIGIN: "https://web.example/elsewhere" },
  ])
    expect(() => loadConfig(env)).toThrow();
  const config = {
    AGENT_PASS_MODE: "oidc",
    AGENT_PASS_CLIENT_ID: "client",
    AGENT_PASS_CLIENT_SECRET: "secret",
    AGENT_PASS_REDIRECT_URI: "https://api.example/agent-pass/callback",
    WEB_ORIGIN: "https://web.example",
  };
  expect(loadConfig(config).agentPassMode).toBe("oidc");
  expect(() =>
    loadConfig({
      ...config,
      AGENT_PASS_REDIRECT_URI: "http://api.example/agent-pass/callback",
    }),
  ).toThrow("AGENT_PASS_REDIRECT_URI");
});
