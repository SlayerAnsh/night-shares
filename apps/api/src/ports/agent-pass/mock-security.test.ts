import { expect, test } from "bun:test";
import { loadConfig } from "../../config/load-config";
import { agentPassConfig } from "./config";
import { assertMockSecurity } from "./mock-security";

for (const adapters of ["arc", "real", ""]) {
  test(`mock checkpoints refuse ${adapters || "empty"} adapters`, () => {
    expect(() => agentPassConfig({ ADAPTERS: adapters })).toThrow(
      "AGENT_PASS_MODE=mock requires ADAPTERS=mock",
    );
    expect(() => assertMockSecurity({ adapters })).toThrow(
      "WORLD_ID_MODE=mock",
    );
    expect(() =>
      assertMockSecurity({ adapters, worldIdMode: "cloud" }),
    ).toThrow("WALLET_CUSTODY=mock");
    expect(() =>
      assertMockSecurity({
        adapters,
        worldIdMode: "cloud",
        walletCustody: "privy",
      }),
    ).toThrow("AGENT_PASS_MODE=mock");
  });
}
test("IDKit fallback requires cloud, OIDC requires credentials", () => {
  expect(() =>
    agentPassConfig({
      ADAPTERS: "arc",
      AGENT_APPROVAL: "idkit",
      WORLD_ID_MODE: "cloud",
    }),
  ).not.toThrow();
  expect(() =>
    agentPassConfig({
      ADAPTERS: "arc",
      AGENT_APPROVAL: "idkit",
      WORLD_ID_MODE: "mock",
    }),
  ).toThrow();
  expect(() =>
    agentPassConfig({
      ADAPTERS: "arc",
      AGENT_PASS_MODE: "oidc",
      AGENT_PASS_REDIRECT_URI: "https://api.example/agent-pass/callback",
      WEB_ORIGIN: "https://web.example",
    }),
  ).toThrow("AGENT_PASS_CLIENT_ID");
});
test("loadConfig rejects mocked human and custody settings before adapter startup", () => {
  expect(() =>
    loadConfig({ ADAPTERS: "arc", RECEPTION_TAG_SECRET: "test" }),
  ).toThrow("WORLD_ID_MODE=mock");
  expect(() =>
    loadConfig({
      ADAPTERS: "arc",
      RECEPTION_TAG_SECRET: "test",
      WORLD_ID_MODE: "cloud",
    }),
  ).toThrow("WALLET_CUSTODY=mock");
});
