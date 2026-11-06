import { hash } from "@night-shares/market-model";
import { ReleasePolicy } from "@night-shares/proto/host/v1/opening_pb";
import { mockSubjectFor } from "../../../ports/identity-verifier/identity-verifier.mock";
import { DomainError } from "../../../shared/errors/domain-error";
import type { CatalogRepo } from "../../catalog-data/catalog-repo";
import type { Connection, HostRepo } from "./host-repo";

const demoProperties = ["prop_velana", "prop_ubud", "prop_rive", "prop_alpen"];
export function createMemoryHostRepo(catalog: CatalogRepo): HostRepo {
  const users = new Map<string, Map<string, Connection>>();
  const owners = new Map<string, string>();
  const releases = new Map<string, ReleasePolicy>();
  const withdrawals = new Map<string, bigint>();
  function connections(userId: string) {
    let value = users.get(userId);
    if (!value) {
      value = new Map();
      users.set(userId, value);
    }
    return value;
  }
  return {
    initialize(user) {
      if (user.humanId !== mockSubjectFor("host")) return;
      for (const id of demoProperties) {
        if (owners.has(id)) continue;
        const p = catalog.get(id);
        if (!p) continue;
        owners.set(id, user.id);
        connections(user.id).set(id, {
          pms:
            ["Mews", "Cloudbeds", "SiteMinder"][hash(p.modelId) % 3] ?? "Mews",
          roomTypes: p.roomTypes,
        });
      }
    },
    owner: (id) => owners.get(id),
    claim(userId, propertyId) {
      // Demo hotels are reserved even before their owner's first host RPC.
      if (owners.has(propertyId) || demoProperties.includes(propertyId))
        throw new DomainError(
          "PERMISSION_DENIED",
          "This property is managed by another host.",
        );
      owners.set(propertyId, userId);
    },
    connections,
    release: (key) => releases.get(key) ?? ReleasePolicy.ARRIVAL_14,
    setRelease: (key, policy) => {
      releases.set(key, policy);
    },
    withdrawn: (property) => withdrawals.get(property) ?? 0n,
    addWithdrawal(property, amount) {
      withdrawals.set(property, (withdrawals.get(property) ?? 0n) + amount);
    },
  };
}
