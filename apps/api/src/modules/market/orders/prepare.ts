import { create } from "@bufbuild/protobuf";
import {
  type Timestamp,
  timestampFromMs,
  timestampMs,
} from "@bufbuild/protobuf/wkt";
import { AskSchema } from "@night-shares/proto/market/v1/book_pb";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";
import { toProto } from "../../../shared/night-key";
import { type Deps, quantity } from "../use-cases/context";
import { orderSettings } from "./settings";
import { makerNonce } from "./store";
import { orderTypedData } from "./typed-data";
export function prepareAsk(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  price: bigint,
  expiry?: Timestamp,
  nonce?: bigint,
) {
  quantity({ tenths: size });
  if (price <= 0n)
    throw new DomainError("INVALID_ARGUMENT", "Ask price must be positive.");
  const now = deps.ports.clock.now();
  // Whole seconds, because the on chain order carries expiry as uint64 seconds.
  const expires =
    Math.floor((expiry ? timestampMs(expiry) : now + 86400000) / 1000) * 1000;
  if (
    !Number.isSafeInteger(expires) ||
    expires <= now ||
    expires > now + 7 * 86400000
  )
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Ask expiry must be in the future and within seven days.",
    );
  const current = makerNonce(deps.ports.db, user.walletAddress);
  if (nonce !== undefined && nonce !== current)
    throw new DomainError("FAILED_PRECONDITION", "Ask nonce is stale.");
  const data = orderTypedData(
    {
      night: key,
      size,
      price,
      expiry: expires,
      nonce: current,
      maker: user.walletAddress,
    },
    orderSettings(deps.ports).domain,
  );
  return {
    ...data,
    expires,
    order: create(AskSchema, {
      id: `${key}|${user.walletAddress}`,
      night: toProto(key),
      size: { tenths: size },
      price: { micros: price },
      expiry: timestampFromMs(expires),
      nonce: current,
      maker: user.walletAddress,
      digest: data.digest,
    }),
  };
}
