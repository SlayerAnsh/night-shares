import { MAKER_REBATE, REBATE_BAND } from "./constants";

export interface MakerRebateInput {
  askPrice: number;
  poolPrice: number;
  size: number;
  poolBalance?: number;
}

export const makerRebate = ({
  askPrice,
  poolPrice,
  size,
  poolBalance = Infinity,
}: MakerRebateInput): number =>
  askPrice <= poolPrice * (1 + REBATE_BAND)
    ? Math.min(askPrice * size * MAKER_REBATE, Math.max(0, poolBalance))
    : 0;
