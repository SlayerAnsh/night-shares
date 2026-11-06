import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import { HostService } from "@night-shares/proto/host/v1/host_pb";
import { IdentityService } from "@night-shares/proto/identity/v1/identity_pb";
import { VerificationLevel } from "@night-shares/proto/identity/v1/user_pb";
import { MarketService } from "@night-shares/proto/market/v1/market_pb";
import { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import { WalletService } from "@night-shares/proto/wallet/v1/wallet_pb";
import type { ServerConfig } from "../../src/config/server-config";
import {
  buildContainer,
  type Container,
} from "../../src/container/build-container";
import { mockSubjectFor } from "../../src/ports/identity-verifier/identity-verifier.mock";
import { createServer } from "../../src/server/create-server";
export async function createHarness(
  container: Container = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
    clock: "mock",
    ids: "sequential",
    today: "2026-12-01",
  }),
  serverConfig: Partial<ServerConfig> = {},
) {
  const server = createServer(container, {
    rateLimitEnabled: false,
    logLevel: "silent",
    ...serverConfig,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server did not bind a TCP port.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  function clientsFor(token?: string) {
    const transport = createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
      useBinaryFormat: false,
      interceptors: token
        ? [
            (next) => (request) => {
              request.header.set("authorization", `Bearer ${token}`);
              return next(request);
            },
          ]
        : [],
    });
    return {
      identity: createClient(IdentityService, transport),
      catalog: createClient(CatalogService, transport),
      stay: createClient(StayService, transport),
      market: createClient(MarketService, transport),
      host: createClient(HostService, transport),
      wallet: createClient(WalletService, transport),
    };
  }
  const clients = clientsFor();
  return {
    container,
    server,
    baseUrl,
    clients,
    clientsFor,
    async signIn(level: "device" | "orb", seed = "e2e") {
      const request = await clients.identity.startSignIn({
        level:
          level === "orb" ? VerificationLevel.ORB : VerificationLevel.DEVICE,
      });
      const session = await clients.identity.completeSignIn({
        requestId: request.requestId,
        proof: { case: "mockProof", value: `mock:${seed}:${level}` },
      });
      return { ...session, clients: clientsFor(session.sessionToken) };
    },
    // Creates a session directly through the ports, without the World ID
    // flow. Use it in domain tests so they do not depend on identity.
    async signInAs(level: "device" | "orb", seed = "e2e") {
      // Same subject the mock World ID flow gives this seed.
      const humanId = mockSubjectFor(seed);
      const user = {
        id: `usr_${seed}`,
        humanId,
        level,
        walletAddress: await container.ports.walletProvider.linkWallet(humanId),
      };
      const token = container.ports.sessions.create(user);
      return { user, token, clients: clientsFor(token) };
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      container.ports.db.close();
    },
  };
}
