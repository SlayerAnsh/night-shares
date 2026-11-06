import type { StayQuote, Trip } from "@night-shares/proto/stay/v1/trip_pb";
export type QuoteLock = {
  id: string;
  userId: string;
  quote: StayQuote;
  expiresAt: number;
  busy: boolean;
  tripId?: string;
};
export type StoredTrip = {
  userId: string;
  trip: Trip;
  guestName: string;
  guestEmail: string;
  walletAddress: string;
  paidAt: number;
};
export interface StayRepo {
  quotes: Map<string, StayQuote>;
  locks: Map<string, QuoteLock>;
  trips: Map<string, StoredTrip>;
  saves: Map<string, Set<string>>;
}
