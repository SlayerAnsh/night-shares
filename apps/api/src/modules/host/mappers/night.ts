import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { book, routeBuy, toMicros, toTenths } from "@night-shares/market-model";
import {
  DemandPreset,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
import { parseDate } from "../../../shared/dates";
import type { NightRecord } from "../../inventory/inventory-repo";
import type { HostRepo } from "../repo/host-repo";
import { payoutOf } from "./payout";
export function releaseMs(date: string, policy: ReleasePolicy) {
  const days =
    policy === ReleasePolicy.DAY_BEFORE_18
      ? -1
      : policy === ReleasePolicy.THREE_DAYS_BEFORE_12
        ? -3
        : 0;
  const hour =
    policy === ReleasePolicy.DAY_BEFORE_18
      ? 18
      : policy === ReleasePolicy.THREE_DAYS_BEFORE_12
        ? 12
        : 14;
  return parseDate(date) + days * 86_400_000 + hour * 3_600_000;
}
export function guestMicros(record: NightRecord) {
  if (record.stopped || record.state.S - record.state.booked < 1) return 0n;
  return toMicros(
    routeBuy(book(record.state), 1, {
      guest: true,
      recallable: record.state.held,
    }).total,
  );
}
export function mapNight(record: NightRecord, repo: HostRepo) {
  const s = record.state;
  const policy = repo.release(record.key);
  return {
    night: {
      propertyId: record.propertyId,
      roomTypeId: record.roomTypeId,
      date: record.date,
    },
    allotment: { tenths: toTenths(s.S) },
    booked: { tenths: toTenths(s.booked) },
    held: { tenths: toTenths(s.held) },
    onSale: {
      tenths: record.stopped
        ? 0
        : Math.max(0, toTenths(s.S - s.booked - s.held)),
    },
    usualRate: { micros: toMicros(s.usualRate) },
    guestPrice: { micros: guestMicros(record) },
    demandPreset: {
      calm: DemandPreset.CALM,
      normal: DemandPreset.NORMAL,
      peak: DemandPreset.PEAK,
    }[s.preset],
    releasePolicy: policy,
    isStopped: record.stopped,
    releaseAt: timestampFromMs(releaseMs(record.date, policy)),
    payout: payoutOf([record]),
  };
}
