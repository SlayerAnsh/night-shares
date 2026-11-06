import type { ReleasePolicy } from "@night-shares/proto/host/v1/opening_pb";
import type { CatalogRoomType } from "../../catalog-data/catalog-repo";
export type Connection = { pms: string; roomTypes: CatalogRoomType[] };
export interface HostRepo {
  connections(userId: string): Map<string, Connection>;
  release(key: string): ReleasePolicy;
  setRelease(key: string, policy: ReleasePolicy): void;
  withdrawn(userId: string, propertyId: string): bigint;
  addWithdrawal(userId: string, propertyId: string, amount: bigint): void;
}
