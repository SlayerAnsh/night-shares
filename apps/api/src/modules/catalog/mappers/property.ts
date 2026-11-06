import { create } from "@bufbuild/protobuf";
import { PropertySchema } from "@night-shares/proto/catalog/v1/property_pb";
import type { CatalogProperty } from "../../catalog-data/catalog-repo";
export const propertyToProto = (property: CatalogProperty) =>
  create(PropertySchema, property);
