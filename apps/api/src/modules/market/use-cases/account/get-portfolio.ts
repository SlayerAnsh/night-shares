import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { cutoffRefund, toMicros } from "@night-shares/market-model";
import { GetPortfolioResponseSchema } from "@night-shares/proto/market/v1/market_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { mulTenths } from "../../../../shared/money";
import { toProto } from "../../../../shared/night-key";
import { toWholeTenths } from "../../../../shared/tenths";
import { signedAsks } from "../../orders/store";
import { type Deps, syncPosition } from "../context";
import { humanWallets } from "../human-wallets";
import { isHost } from "../trading/host-fees";
export function getPortfolio(deps: Deps, user: User) {
  const response = create(GetPortfolioResponseSchema);
  let realised = 0n,
    unrealised = 0n,
    closed = 0,
    wins = 0,
    returns = 0;
  for (const key of deps.repo.account(user.humanId).positions.keys()) {
    const record = deps.ports.inventory.get(key);
    const position = syncPosition(deps, user, record);
    const wallets = humanWallets(deps.ports, user, record.propertyId);
    const ask = record.state.traderAsks.find((a) => wallets.has(a.who ?? ""));
    const signed = signedAsks(deps.ports.db, key).find(
      (a) => a.maker === ask?.who,
    );
    const size = position.free + position.escrow;
    const value = mulTenths(toMicros(record.state.pstar), size);
    const pnl = value - mulTenths(position.average, size);
    realised += position.realised;
    unrealised += pnl;
    closed += position.closed;
    wins += position.wins;
    returns += position.returns;
    const night = toProto(key);
    if (size)
      response.holdings.push({
        $typeName: "night_shares.market.v1.Holding",
        isHost: isHost(deps.ports, record.propertyId, user),
        night,
        size: { $typeName: "night_shares.common.v1.RoomNights", tenths: size },
        averageCost: {
          $typeName: "night_shares.common.v1.Usdc",
          micros: position.average,
        },
        value: { $typeName: "night_shares.common.v1.Usdc", micros: value },
        unrealisedPnl: {
          $typeName: "night_shares.common.v1.Usdc",
          micros: pnl,
        },
        unsoldRefund: {
          $typeName: "night_shares.common.v1.Usdc",
          micros: mulTenths(
            toMicros(cutoffRefund(record.state).perNight),
            size,
          ),
        },
      });
    if (ask)
      response.listings.push({
        $typeName: "night_shares.market.v1.Ask",
        id: `${key}|${ask.who}`,
        expiry: signed ? timestampFromMs(Number(signed.expiry)) : undefined,
        nonce: signed?.nonce ?? 0n,
        maker: signed?.maker ?? "",
        digest: signed?.digest ?? "",
        night,
        size: {
          $typeName: "night_shares.common.v1.RoomNights",
          tenths: toWholeTenths(ask.size),
        },
        price: {
          $typeName: "night_shares.common.v1.Usdc",
          micros: toMicros(ask.price),
        },
      });
  }
  response.realisedPnl = {
    $typeName: "night_shares.common.v1.Usdc",
    micros: realised,
  };
  response.unrealisedPnl = {
    $typeName: "night_shares.common.v1.Usdc",
    micros: unrealised,
  };
  response.trackRecord = {
    $typeName: "night_shares.market.v1.TraderTrackRecord",
    closedPositions: closed,
    profitableBps: closed ? Math.round((wins / closed) * 10000) : 0,
    averageReturnBps: closed ? Math.round(returns / closed) : 0,
    realisedPnl: response.realisedPnl,
  };
  response.agentOrders = [
    ...deps.repo.account(user.humanId).orders.values(),
  ].map((o) => structuredClone(o));
  return response;
}
