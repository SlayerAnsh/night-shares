import { expect, test } from "bun:test";
import { loadConfig } from "../../config/load-config";

test("v4 cloud configuration requires RP registration and a server signing key", () => {
  expect(loadConfig({})).toMatchObject({
    worldIdMode: "mock",
    worldIdAction: "night-shares-enroll",
    worldIdEnvironment: "staging",
    worldIdAllowLegacy: true,
    worldIdVerifyUrl: "https://developer.world.org/api/v4/verify/{rp_id}",
  });
  const env = {
    WORLD_ID_MODE: "cloud",
    WORLD_ID_APP_ID: "app_test",
    WORLD_ID_RP_ID: "rp_test",
    WORLD_ID_SIGNING_KEY: "01".repeat(32),
  };
  expect(() => loadConfig({ ...env, WORLD_ID_RP_ID: "" })).toThrow(
    "WORLD_ID_RP_ID",
  );
  expect(() => loadConfig({ ...env, WORLD_ID_SIGNING_KEY: "" })).toThrow(
    "WORLD_ID_SIGNING_KEY",
  );
  expect(() => loadConfig({ ...env, WORLD_ID_ENVIRONMENT: "sandbox" })).toThrow(
    "WORLD_ID_ENVIRONMENT",
  );
  expect(() => loadConfig({ ...env, WORLD_ID_ALLOW_LEGACY: "yes" })).toThrow(
    "WORLD_ID_ALLOW_LEGACY",
  );
  expect(() => loadConfig({ ...env, WORLD_ID_ENROLL_ACTION: " " })).toThrow(
    "WORLD_ID_ENROLL_ACTION",
  );
  expect(loadConfig(env).worldIdMode).toBe("cloud");
});
