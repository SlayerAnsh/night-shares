import { randomBytes } from "node:crypto";
import type { Config } from "../config/load-config";
import { openDatabase } from "../db/open-database";
import { createCatalogModule } from "../modules/catalog/module";
import { createMemoryCatalogRepo } from "../modules/catalog-data/catalog-repo.memory";
import { createHostModule } from "../modules/host/module";
import { createIdentityModule } from "../modules/identity/module";
import { createSqliteInventoryRepo } from "../modules/inventory/inventory-repo.sqlite";
import { createMarketModule } from "../modules/market/module";
import { signedInventory } from "../modules/market/orders/inventory";
import { configureOrders } from "../modules/market/orders/settings";
import { defaultDomain } from "../modules/market/orders/typed-data";
import { createStayModule } from "../modules/stay/module";
import { createWalletModule } from "../modules/wallet/module";
import { createSqliteActivityLog } from "../ports/activity/activity-log.sqlite";
import { bookingReportFor } from "../ports/booking-report/booking-report.mock";
import { createMockChannelManager } from "../ports/channel-manager/channel-manager.mock";
import { createMockClock } from "../ports/clock/clock.mock";
import { createSystemClock } from "../ports/clock/clock.system";
import { createMockIdentityVerifier } from "../ports/identity-verifier/identity-verifier.mock";
import { createWorldIdIdentityVerifier } from "../ports/identity-verifier/identity-verifier.world-id";
import { createMockIdGenerator } from "../ports/ids/id-generator.mock";
import { createRandomIdGenerator } from "../ports/ids/id-generator.random";
import { createMockOrderSigner } from "../ports/order-signer/order-signer.mock";
import { createMockReceptionTag } from "../ports/reception-tag/reception-tag.mock";
import { createSqliteSessionStore } from "../ports/sessions/session-store.sqlite";
import { createSqliteVerificationStore } from "../ports/verifications/verification-store.sqlite";
import { createSqliteWalletProvider } from "../ports/wallet-provider/wallet-provider.sqlite";
import { parseDate } from "../shared/dates";
import type { Ports } from "./ports";
export function buildContainer(config: Config) {
  if (config.devTagIssuer && config.adapters !== "mock")
    throw new Error("DEV_TAG_ISSUER requires ADAPTERS=mock.");
  if (config.adapters !== "mock" && !config.receptionTagSecret?.trim())
    throw new Error(
      "RECEPTION_TAG_SECRET is required when ADAPTERS is not mock.",
    );
  if (config.adapters !== "mock")
    throw new Error("Only mock adapters are available.");
  // Older unit fixtures omit these options. Boot config always supplies them.
  const testing = process.env.NODE_ENV === "test";
  const db = openDatabase(
    config.dbPath ?? (testing ? ":memory:" : "./data/night-shares.db"),
  );
  const clock =
    (config.clock ?? (testing ? "mock" : "system")) === "mock"
      ? createMockClock(
          config.today === undefined ? undefined : parseDate(config.today),
        )
      : createSystemClock(config.today);
  const ids =
    (config.ids ?? (testing ? "sequential" : "random")) === "sequential"
      ? createMockIdGenerator()
      : createRandomIdGenerator();
  const receptionTag = createMockReceptionTag(
    config.receptionTagSecret?.trim() ||
      (config.devTagIssuer
        ? "night-shares-dev-reception-secret"
        : randomBytes(32).toString("hex")),
    db,
  );
  const catalog = createMemoryCatalogRepo();
  const walletProvider = createSqliteWalletProvider({ db, ids, clock });
  const ports: Ports & { bookingReport: ReturnType<typeof bookingReportFor> } =
    {
      receptionTag,
      issueReceptionTag:
        config.devTagIssuer === true ? receptionTag.issueTagPayload : undefined,
      bookingReport: bookingReportFor({ db, ids }),
      db,
      clock,
      ids,
      catalog,
      walletProvider,
      activity: createSqliteActivityLog({ db, ids, clock }),
      verifications: createSqliteVerificationStore({ db, clock }),
      inventory: createSqliteInventoryRepo({ db, catalog, clock }),
      sessions: createSqliteSessionStore({ db, clock }),
      identityVerifier:
        config.worldIdMode === "world-id"
          ? createWorldIdIdentityVerifier({
              db,
              clock,
              ids,
              appId: config.worldIdAppId ?? "",
              action: config.worldIdAction,
              verifyUrl: config.worldIdVerifyUrl,
            })
          : createMockIdentityVerifier({
              db,
              clock,
              ids,
              action: config.worldIdAction,
            }),
      channelManager: createMockChannelManager({ catalog, clock, ids }),
    };
  configureOrders(ports, {
    domain: {
      chainId: config.orderChainId ?? defaultDomain.chainId,
      verifyingContract: (config.orderVerifyingContract ??
        defaultDomain.verifyingContract) as `0x${string}`,
    },
    signer: createMockOrderSigner(config.orderMockSecret),
    custodial: config.adapters === "mock",
  });
  ports.inventory = signedInventory(ports, ports.inventory);
  const modules = {
    identity: createIdentityModule(ports),
    catalog: createCatalogModule(ports),
    stay: createStayModule(ports),
    market: createMarketModule(ports),
    host: createHostModule(ports),
    wallet: createWalletModule(ports),
  };
  return { ports, modules };
}
export type Container = ReturnType<typeof buildContainer>;
