import { FEE, LATE_HOURS, LATE_MAX } from "./constants";

export const lateFee = (hoursLeft: number): number =>
  hoursLeft >= LATE_HOURS
    ? FEE
    : hoursLeft <= 0
      ? LATE_MAX
      : FEE + ((LATE_MAX - FEE) * (LATE_HOURS - hoursLeft)) / LATE_HOURS;
