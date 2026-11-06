import { expect, test } from "bun:test";
import { buildContainer } from "../../src/container/build-container";
import { mockSubjectFor } from "../../src/ports/identity-verifier/identity-verifier.mock";
import { createHarness } from "./harness";

test("World ID sign-in creates a stable mock wallet and signs a trader ask", async () => {
  const container = buildContainer({
    port: 0,
    adapters: "mock",
    walletCustody: "mock",
    arcNetwork: "mainnet",
    clock: "mock",
    ids: "sequential",
    dbPath: ":memory:",
    today: "2026-12-01",
  });
  container.ports.walletProvider.onchainUsdcBalance = async () => null;
  const harness = await createHarness(container);
  try {
    const signedIn = await harness.signIn("orb", "custody_flow");
    const balance = await signedIn.clients.wallet.getBalance({});
    const wallet = await container.ports.walletProvider.custody?.getWallet({
      kind: "user",
      humanId: mockSubjectFor("custody_flow"),
    });
    expect(balance.walletAddress).toBe(wallet?.address ?? "missing");
    expect(balance.explorerUrl).toBe(
      `https://explorer.arc.io/address/${balance.walletAddress}`,
    );
    expect(balance.onchainUsdcBalance).toBeUndefined();
    const again = await harness.signIn("orb", "custody_flow");
    expect((await again.clients.wallet.getBalance({})).walletAddress).toBe(
      balance.walletAddress,
    );
    const night = {
      propertyId: "prop_velana",
      roomTypeId: "rt_velana_0",
      date: "2026-12-01",
    };
    await signedIn.clients.market.buy({
      night,
      size: { tenths: 3 },
      maxTotal: { micros: 10n ** 12n },
    });
    const posted = await signedIn.clients.market.postAsk({
      night,
      size: { tenths: 3 },
      price: { micros: 1000000n },
    });
    expect(posted.ask?.maker).toBe(balance.walletAddress);
    const stored = container.ports.db
      .query<{ signature: string; digest: string }, [string]>(
        "SELECT signature, digest FROM market_signed_asks WHERE maker = ?",
      )
      .get(balance.walletAddress);
    expect(stored?.signature).toMatch(/^mock:[0-9a-f]{64}$/);
    expect(stored?.digest).toBe(posted.ask?.digest ?? "missing");
  } finally {
    await harness.close();
  }
});
