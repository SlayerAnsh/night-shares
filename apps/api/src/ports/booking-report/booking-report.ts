export type DoubleSaleReport = { id: string; nightKey: string; rooms: number };
export interface BookingReport {
  poll(): Promise<DoubleSaleReport[]>;
}
