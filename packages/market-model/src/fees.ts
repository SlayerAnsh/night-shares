import { FEE, LATE_HOURS, LATE_MAX } from "./constants";

export const askFillProceeds = (price: number, size = 1) => ({
  gross: price * size,
  fee: price * size * FEE,
  net: price * size * (1 - FEE),
});

export const lateFee = (hoursLeft: number): number =>
  hoursLeft >= LATE_HOURS
    ? FEE
    : hoursLeft <= 0
      ? LATE_MAX
      : FEE + ((LATE_MAX - FEE) * (LATE_HOURS - hoursLeft)) / LATE_HOURS;
