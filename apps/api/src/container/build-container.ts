import type { Config } from "../config/load-config";
import { createCatalogModule } from "../modules/catalog/module";
import { createMemoryCatalogRepo } from "../modules/catalog-data/catalog-repo.memory";
import { createHostModule } from "../modules/host/module";
import { createIdentityModule } from "../modules/identity/module";
import { createMemoryInventoryRepo } from "../modules/inventory/inventory-repo.memory";
import { createMarketModule } from "../modules/market/module";
import { createStayModule } from "../modules/stay/module";
import { createWalletModule } from "../modules/wallet/module";
import { createMemoryActivityLog } from "../ports/activity/activity-log.memory";
import { createMockChannelManager } from "../ports/channel-manager/channel-manager.mock";
import { createMockClock } from "../ports/clock/clock.mock";
import { createMockIdentityVerifier } from "../ports/identity-verifier/identity-verifier.mock";
import { createMockIdGenerator } from "../ports/ids/id-generator.mock";
import { createMockOnramp } from "../ports/onramp/onramp.mock";
import { createMemorySessionStore } from "../ports/sessions/session-store.memory";
import { createMemoryVerificationStore } from "../ports/verifications/verification-store.memory";
import { createMockWalletProvider } from "../ports/wallet-provider/wallet-provider.mock";
import { parseDate } from "../shared/dates";
import type { Ports } from "./ports";
export function buildContainer(config: Config) {
  if (config.adapters !== "mock")
    throw new Error("Only mock adapters are available.");
  const clock = createMockClock(
    config.today === undefined ? undefined : parseDate(config.today),
  );
  const ids = createMockIdGenerator();
  const catalog = createMemoryCatalogRepo();
  const walletProvider = createMockWalletProvider({ ids, clock });
  const ports: Ports = {
    clock,
    ids,
    catalog,
    walletProvider,
    activity: createMemoryActivityLog({ ids, clock }),
    verifications: createMemoryVerificationStore({ clock }),
    inventory: createMemoryInventoryRepo({ catalog, clock }),
    sessions: createMemorySessionStore(),
    identityVerifier: createMockIdentityVerifier({ clock, ids }),
    onramp: createMockOnramp({ ids, wallet: walletProvider }),
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
