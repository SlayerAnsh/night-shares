import { buildContainer } from "../../../container/build-container";
import type { User } from "../../../ports/sessions/session-store";
import { format } from "../../../shared/night-key";
import { createSqliteMarketRepo } from "../repo/market-repo.sqlite";
export async function fixture() {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
  });
  const repo = createSqliteMarketRepo(ports.db);
  const user: User = {
    id: "usr_trader",
    humanId: "human_trader",
    level: "orb",
    walletAddress: await ports.walletProvider.linkWallet("human_trader"),
  };
  const night = {
    propertyId: "prop_velana",
    roomTypeId: "rt_velana_0",
    date: "2026-12-01",
  };
  const key = format(night);
  ports.inventory.get(key);
  return { ports, repo, user, night, key };
}
