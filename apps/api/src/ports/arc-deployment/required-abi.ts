import { BookingRouter } from "./abi-booking-router";
import { CoverFund } from "./abi-cover-fund";
import { HumanRegistry } from "./abi-human-registry";
import { NightFactory } from "./abi-night-factory";
import { NightHook } from "./abi-night-hook";
import { NightToken } from "./abi-night-token";
import { NightVault } from "./abi-night-vault";
import { RebatePool } from "./abi-rebate-pool";
import { Settlement } from "./abi-settlement";
import { TradeRouter } from "./abi-trade-router";
import { x402RequiredAbi } from "./x402-required-abi";
export const legacyRequiredAbi: Record<string, string[]> = {
  NightFactory,
  NightVault,
  NightHook,
  TradeRouter,
  BookingRouter,
  Settlement,
  HumanRegistry,
  CoverFund,
  RebatePool,
  NightToken,
};

export const requiredAbi = Object.fromEntries(
  [
    ...new Set([
      ...Object.keys(legacyRequiredAbi),
      ...Object.keys(x402RequiredAbi),
    ]),
  ].map((name) => [
    name,
    [
      ...(legacyRequiredAbi[name] ?? []).filter((entry) => {
        const item = JSON.parse(entry);
        return !(x402RequiredAbi[name] ?? []).some((added) => {
          const replacement = JSON.parse(added);
          return (
            item.type === replacement.type && item.name === replacement.name
          );
        });
      }),
      ...(x402RequiredAbi[name] ?? []),
    ],
  ]),
);
