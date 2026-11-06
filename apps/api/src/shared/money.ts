import { create } from "@bufbuild/protobuf";
import { toMicros } from "@night-shares/market-model";
import { type Usdc, UsdcSchema } from "@night-shares/proto/common/v1/money_pb";
import { DomainError } from "./errors/domain-error";
export const add = (...amounts: bigint[]): bigint =>
  amounts.reduce((a, b) => a + b, 0n);
// Fractional micros are truncated toward zero.
export function mulTenths(micros: bigint, tenths: number): bigint {
  if (!Number.isSafeInteger(tenths))
    throw new DomainError("INVALID_ARGUMENT", "Tenths must be a safe integer.");
  return (micros * BigInt(tenths)) / 10n;
}
export const fromUsd = (usd: number): bigint => toMicros(usd);
export const toProto = (micros: bigint): Usdc => create(UsdcSchema, { micros });
export const fromProto = (money: Usdc): bigint => money.micros;
