import { hash } from "../random/hash";
import { rng } from "../random/rng";
export function hostTrackRecord(property: {
  modelId: string;
  popular: boolean;
  base: number;
  rooms: number;
}) {
  const random = rng(hash(`track${property.modelId}`));
  const booked = Math.min(
    0.94,
    0.58 + random() * 0.26 + (property.popular ? 0.06 : 0),
  );
  return {
    nightsTraded: 140 + Math.floor(random() * 520),
    bookedBps: Math.round(booked * 10000),
    unsoldBps: Math.round(
      Math.max(0.02, (1 - booked) * (0.35 + random() * 0.3)) * 10000,
    ),
    averageReturnBps: Math.round(
      (-0.01 + random() * 0.08 + (property.popular ? 0.015 : 0)) * 10000,
    ),
    profitableBps: Math.round((0.52 + random() * 0.26) * 10000),
    refundBps: Math.round((0.32 + random() * 0.16) * 10000),
    honouredBps: Math.round((0.975 + random() * 0.024) * 10000),
    incidents: random() < 0.7 ? 0 : 1 + Math.floor(random() * 2),
  };
}
