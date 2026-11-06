// Adapters authenticate the reporter and timestamp before submitting a report.
export type WalkReport = {
  id: string;
  bookingId: string;
  userId: string;
  humanId: string;
  reportedAt: number;
};
export interface BookingReport {
  poll(): Promise<WalkReport[]>;
}
