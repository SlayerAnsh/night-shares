import { hash } from "@night-shares/market-model";
import { ReleasePolicy } from "@night-shares/proto/host/v1/opening_pb";
import type { CatalogRepo } from "../../catalog-data/catalog-repo";
import type { Connection, HostRepo } from "./host-repo";
export function createMemoryHostRepo(catalog: CatalogRepo): HostRepo {
  const users = new Map<string, Map<string, Connection>>();
  const releases = new Map<string, ReleasePolicy>();
  const withdrawals = new Map<string, bigint>();
  return {
    connections(userId) {
      let connections = users.get(userId);
      if (!connections) {
        connections = new Map();
        // Every Orb user is a demo host of these shared hotels, not a verified owner.
        for (const id of [
          "prop_velana",
          "prop_ubud",
          "prop_rive",
          "prop_alpen",
        ]) {
          const p = catalog.get(id);
          if (p)
            connections.set(id, {
              pms:
                ["Mews", "Cloudbeds", "SiteMinder"][hash(p.modelId) % 3] ??
                "Mews",
              roomTypes: p.roomTypes,
            });
        }
        users.set(userId, connections);
      }
      return connections;
    },
    release: (key) => releases.get(key) ?? ReleasePolicy.ARRIVAL_14,
    setRelease: (key, policy) => {
      releases.set(key, policy);
    },
    withdrawn: (user, property) => withdrawals.get(`${user}|${property}`) ?? 0n,
    addWithdrawal(user, property, amount) {
      const key = `${user}|${property}`;
      withdrawals.set(key, (withdrawals.get(key) ?? 0n) + amount);
    },
  };
}
