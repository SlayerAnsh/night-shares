import { expect, test } from "bun:test";
import { loadConfig } from "./load-config";

test("World ID defaults to mock and validates real configuration at boot", () => {
  expect(loadConfig({})).toMatchObject({
    worldIdMode: "mock",
    worldIdAppId: "",
    worldIdRpId: "",
    worldIdSigningKey: "",
    worldIdEnvironment: "staging",
    worldIdAllowLegacy: true,
    worldIdDeviceCredential: "selfieCheck",
    worldIdAction: "night-shares-enroll",
    worldIdVerifyUrl: "https://developer.world.org/api/v4/verify/{rp_id}",
  });
  expect(() => loadConfig({ WORLD_ID_MODE: "world-id" })).toThrow(
    "WORLD_ID_APP_ID",
  );
  expect(() => loadConfig({ WORLD_ID_MODE: "invalid" })).toThrow(
    "WORLD_ID_MODE",
  );
  expect(loadConfig({ WORLD_ID_ENROLL_ACTION: " " }).worldIdAction).toBe(
    "night-shares-enroll",
  );
  expect(() => loadConfig({ WORLD_ID_VERIFY_URL: "http://localhost" })).toThrow(
    "WORLD_ID_VERIFY_URL",
  );
  expect(
    loadConfig({
      WORLD_ID_MODE: "world-id",
      WORLD_ID_APP_ID: "app_staging_test",
      WORLD_ID_RP_ID: "rp_test",
      WORLD_ID_SIGNING_KEY: "01".repeat(32),
    }).worldIdMode,
  ).toBe("world-id");
});

test("real World ID defaults to production and honors explicit environment and endpoints", () => {
  const env = {
    WORLD_ID_MODE: "cloud",
    WORLD_ID_APP_ID: "app_production",
    WORLD_ID_RP_ID: "rp_production",
    WORLD_ID_SIGNING_KEY: "01".repeat(32),
  };
  for (const mode of ["cloud", "world-id"]) {
    expect(
      loadConfig({ ...env, WORLD_ID_MODE: mode, WORLD_ID_ENVIRONMENT: " " }),
    ).toMatchObject({
      worldIdEnvironment: "production",
      worldIdVerifyUrl: "https://developer.world.org/api/v4/verify/{rp_id}",
      agentPassIssuer: "https://auth.world.org",
      agentPassAcr: "https://world.org/oidc/acr/orb",
    });
  }
  for (const environment of ["production", "staging"]) {
    expect(
      loadConfig({
        ...env,
        WORLD_ID_ENVIRONMENT: environment,
        WORLD_ID_VERIFY_URL: "https://verify.example/{rp_id}",
        AGENT_PASS_ISSUER: "https://issuer.example",
        AGENT_PASS_ACR: "https://world.org/oidc/acr/orb",
      }),
    ).toMatchObject({
      worldIdEnvironment: environment,
      worldIdVerifyUrl: "https://verify.example/{rp_id}",
      agentPassIssuer: "https://issuer.example",
      agentPassAcr: "https://world.org/oidc/acr/orb",
    });
  }
  expect(() => loadConfig({ ...env, WORLD_ID_ENVIRONMENT: "invalid" })).toThrow(
    "WORLD_ID_ENVIRONMENT",
  );
});
