import type { CatalogRoomType } from "../../modules/catalog-data/catalog-repo";
export type Reservation = {
  bookingId: string;
  propertyId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guestName: string;
  guestEmail: string;
};
export interface ChannelManager {
  connect(input: {
    propertyId: string;
    pms: string;
  }): Promise<{ roomTypes: (CatalogRoomType & { usualRate: bigint })[] }>;
  pushReservation(reservation: Reservation): Promise<{ hotelRef: string }>;
}
