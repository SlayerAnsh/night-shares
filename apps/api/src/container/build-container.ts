import type { Config } from "../config/load-config";
import { openDatabase } from "../db/open-database";
import { createCatalogModule } from "../modules/catalog/module";
import { createMemoryCatalogRepo } from "../modules/catalog-data/catalog-repo.memory";
import { createHostModule } from "../modules/host/module";
import { createIdentityModule } from "../modules/identity/module";
import { createSqliteInventoryRepo } from "../modules/inventory/inventory-repo.sqlite";
import { createMarketModule } from "../modules/market/module";
import { createStayModule } from "../modules/stay/module";
import { createWalletModule } from "../modules/wallet/module";
import { createSqliteActivityLog } from "../ports/activity/activity-log.sqlite";
import { createMockChannelManager } from "../ports/channel-manager/channel-manager.mock";
import { createMockClock } from "../ports/clock/clock.mock";
import { createSystemClock } from "../ports/clock/clock.system";
import { createMockIdentityVerifier } from "../ports/identity-verifier/identity-verifier.mock";
import { createWorldIdIdentityVerifier } from "../ports/identity-verifier/identity-verifier.world-id";
import { createMockIdGenerator } from "../ports/ids/id-generator.mock";
import { createRandomIdGenerator } from "../ports/ids/id-generator.random";
import { createSqliteSessionStore } from "../ports/sessions/session-store.sqlite";
import { createSqliteVerificationStore } from "../ports/verifications/verification-store.sqlite";
import { createSqliteWalletProvider } from "../ports/wallet-provider/wallet-provider.sqlite";
import { parseDate } from "../shared/dates";
import type { Ports } from "./ports";
export function buildContainer(config: Config) {
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
  const catalog = createMemoryCatalogRepo();
  const walletProvider = createSqliteWalletProvider({ db, ids, clock });
  const ports: Ports = {
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
