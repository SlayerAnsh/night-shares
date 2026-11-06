import { create } from "@bufbuild/protobuf";
import { hostTrackRecord } from "@night-shares/market-model";
import { TrackRecordSchema } from "@night-shares/proto/market/v1/analytics_pb";
import type { CatalogProperty } from "../../../catalog-data/catalog-repo";
export function track(property: CatalogProperty) {
  const result = hostTrackRecord(property);
  return create(TrackRecordSchema, {
    ...result,
  });
}
