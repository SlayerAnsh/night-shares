import type { ReleasePolicy } from "@night-shares/proto/host/v1/opening_pb";
import type { CatalogRoomType } from "../../catalog-data/catalog-repo";
export type Connection = { pms: string; roomTypes: CatalogRoomType[] };
export interface HostRepo {
  initialize(user: import("../../../ports/sessions/session-store").User): void;
  owner(propertyId: string): string | undefined;
  claim(userId: string, propertyId: string): void;
  connections(userId: string): Map<string, Connection>;
  release(key: string): ReleasePolicy;
  setRelease(key: string, policy: ReleasePolicy): void;
  withdrawn(propertyId: string): bigint;
  addWithdrawal(propertyId: string, amount: bigint): void;
}
