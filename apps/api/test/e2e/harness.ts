import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import { HostService } from "@night-shares/proto/host/v1/host_pb";
import { IdentityService } from "@night-shares/proto/identity/v1/identity_pb";
import { VerificationLevel } from "@night-shares/proto/identity/v1/user_pb";
import { MarketService } from "@night-shares/proto/market/v1/market_pb";
import { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import { WalletService } from "@night-shares/proto/wallet/v1/wallet_pb";
import {
  buildContainer,
  type Container,
} from "../../src/container/build-container";
import { createServer } from "../../src/server/create-server";
export async function createHarness(
  container: Container = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
  }),
) {
  const server = createServer(container);
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
        proof: `mock:${seed}:${level}`,
      });
      return { ...session, clients: clientsFor(session.sessionToken) };
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
