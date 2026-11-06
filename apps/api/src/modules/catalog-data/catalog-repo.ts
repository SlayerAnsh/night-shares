import type { MessageInitShape } from "@bufbuild/protobuf";
import type { NightProperty } from "@night-shares/market-model";
import type {
  PropertySchema,
  RoomTypeSchema,
} from "@night-shares/proto/catalog/v1/property_pb";
export type CatalogRoomType = Required<
  Omit<MessageInitShape<typeof RoomTypeSchema>, "$typeName">
>;
export type CatalogProperty = Omit<
  Required<MessageInitShape<typeof PropertySchema>>,
  "roomTypes" | "$typeName"
> &
  Omit<NightProperty, "roomTypes"> & {
    modelId: string;
    tone: string[];
    roomTypes: CatalogRoomType[];
  };
export interface CatalogRepo {
  list(): CatalogProperty[];
  get(propertyId: string): CatalogProperty | undefined;
  getRoomType(
    propertyId: string,
    roomTypeId: string,
  ): CatalogRoomType | undefined;
}
