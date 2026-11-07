import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { loadConfig } from "../../src/config/load-config";
import { buildContainer } from "../../src/container/build-container";
import { createHarness } from "./harness";

test("root deployment example boots mock API with blank optional env values", async () => {
  const example = readFileSync(
    new URL("../../../../.env.example", import.meta.url),
    "utf8",
  );
  const env = Object.fromEntries(
    example
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  const h = await createHarness(
    buildContainer(
      loadConfig({
        ...env,
        ARC_RPC_URLS: "",
        ATTESTER_KEY: " \t ",
        DB_PATH: ":memory:",
        PORT: "0",
      }),
    ),
  );
  try {
    expect((await h.signIn("device", "blank-env")).user).toBeDefined();
  } finally {
    await h.close();
  }
});
