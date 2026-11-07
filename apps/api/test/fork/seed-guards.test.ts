import { expect, test } from "bun:test";
import { seedConfig } from "../../src/dev/seed-fork";

test("fork seed refuses non-fork networks before configuration", () => {
  for (const network of ["mainnet", "testnet"])
    expect(() => seedConfig({ ARC_NETWORK: network })).toThrow(
      "seed:fork requires ARC_NETWORK=fork.",
    );
});
test("fork seed refuses remote RPC endpoints before configuration", () => {
  expect(() =>
    seedConfig({
      ARC_NETWORK: "fork",
      ARC_RPC_URL: "https://rpc.mainnet.arc.io",
    }),
  ).toThrow();
});
