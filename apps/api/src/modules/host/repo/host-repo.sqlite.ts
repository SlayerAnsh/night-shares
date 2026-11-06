import type { Database } from "bun:sqlite";
import { hash } from "@night-shares/market-model";
import { ReleasePolicy } from "@night-shares/proto/host/v1/opening_pb";
import { transaction } from "../../../db/transaction";
import { mockSubjectFor } from "../../../ports/identity-verifier/identity-verifier.mock";
import { DomainError } from "../../../shared/errors/domain-error";
import type { CatalogRepo } from "../../catalog-data/catalog-repo";
import { createSqliteConnections } from "./connections.sqlite";
import type { HostRepo } from "./host-repo";

const demoProperties = ["prop_velana", "prop_ubud", "prop_rive", "prop_alpen"];
export function createSqliteHostRepo({
  db,
  catalog,
}: {
  db: Database;
  catalog: CatalogRepo;
}): HostRepo {
  const repo: HostRepo = {
    initialize(user) {
      if (user.humanId !== mockSubjectFor("host")) return;
      transaction(db, () => {
        for (const id of demoProperties) {
          if (repo.owner(id)) continue;
          const property = catalog.get(id);
          if (!property) continue;
          db.query("INSERT INTO host_owners VALUES (?, ?)").run(id, user.id);
          repo.connections(user.id).set(id, {
            pms:
              ["Mews", "Cloudbeds", "SiteMinder"][hash(property.modelId) % 3] ??
              "Mews",
            roomTypes: property.roomTypes,
          });
        }
      });
    },
    owner(id) {
      return db
        .query<{ user_id: string }, [string]>(
          "SELECT user_id FROM host_owners WHERE property_id = ?",
        )
        .get(id)?.user_id;
    },
    claim(userId, propertyId) {
      transaction(db, () => {
        if (repo.owner(propertyId) || demoProperties.includes(propertyId))
          throw new DomainError(
            "PERMISSION_DENIED",
            "This property is managed by another host.",
          );
        db.query("INSERT INTO host_owners VALUES (?, ?)").run(
          propertyId,
          userId,
        );
      });
    },
    connections: (userId) => createSqliteConnections(db, userId),
    release(key) {
      const row = db
        .query<{ release_policy: bigint }, [string]>(
          "SELECT release_policy FROM host_releases WHERE night_key = ?",
        )
        .get(key);
      return row ? Number(row.release_policy) : ReleasePolicy.ARRIVAL_14;
    },
    setRelease(key, policy) {
      db.query(
        "INSERT INTO host_releases VALUES (?, ?) ON CONFLICT(night_key) DO UPDATE SET release_policy = excluded.release_policy",
      ).run(key, policy);
    },
    withdrawn(propertyId) {
      return (
        db
          .query<{ amount_micros: bigint }, [string]>(
            "SELECT amount_micros FROM host_withdrawals WHERE property_id = ?",
          )
          .get(propertyId)?.amount_micros ?? 0n
      );
    },
    addWithdrawal(propertyId, amount) {
      transaction(db, () => {
        db.query(
          "INSERT INTO host_withdrawals VALUES (?, ?) ON CONFLICT(property_id) DO UPDATE SET amount_micros = excluded.amount_micros",
        ).run(propertyId, repo.withdrawn(propertyId) + amount);
      });
    },
  };
  return repo;
}
