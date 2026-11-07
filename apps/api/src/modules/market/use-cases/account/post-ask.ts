import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { recallStrike, toMicros } from "@night-shares/market-model";
import { transaction } from "../../../../db/transaction";
import { custodialSigner } from "../../../../ports/order-signer/order-signer";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { postChainAsk } from "../../chain/asks";
import { isChain } from "../../chain/runtime";
import { prepareAsk } from "../../orders/prepare";
import { orderSettings } from "../../orders/settings";
import { assertOpen, type Deps, syncPosition } from "../context";
import { humanWallets } from "../human-wallets";
// RPC callers await custody before entering the synchronous insertion transaction.
export async function postAskWithCustody(
  ...[deps, user, key, size, price, options = {}]: Parameters<typeof postAsk>
) {
  if (isChain(deps.ports))
    return postChainAsk(deps, user, key, size, price, options);
  if (options.signature) return postAsk(deps, user, key, size, price, options);
  const prepared = prepareAsk(
    deps,
    user,
    key,
    size,
    price,
    options.expiry,
    options.nonce,
  );
  const settings = orderSettings(deps.ports);
  const signer = custodialSigner(deps.ports) ?? settings.signer;
  const signature = settings.custodial
    ? await signer.signCustodial(
        user.walletAddress,
        prepared.digest,
        prepared.typedDataJson,
      )
    : "";
  if (!signature)
    throw new DomainError("INVALID_ARGUMENT", "Invalid ask signature.");
  return postAsk(deps, user, key, size, price, {
    signature,
    expiry: prepared.order.expiry,
    nonce: prepared.order.nonce,
  });
}

export function postAsk(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  price: bigint,
  options: { expiry?: Timestamp; nonce?: bigint; signature?: string } = {},
) {
  if (isChain(deps.ports))
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Chain asks require awaited custody signing.",
    );
  const preparedSignature = prepareAsk(
    deps,
    user,
    key,
    size,
    price,
    options.expiry,
    options.nonce,
  );
  const settings = orderSettings(deps.ports);
  const custody = custodialSigner(deps.ports);
  if (custody && !options.signature)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Custodial signing must be awaited before posting.",
    );
  const signature =
    options.signature ||
    (settings.custodial
      ? settings.signer.signCustodial(
          user.walletAddress,
          preparedSignature.digest,
        )
      : "");
  return transaction(deps.ports.db, () => {
    if (
      deps.ports.db
        .query("SELECT 1 FROM market_settlements WHERE night_key = ? LIMIT 1")
        .get(key) ||
      deps.ports.db
        .query(
          "SELECT 1 FROM stay_locks WHERE busy = 1 AND trip_id IS NULL LIMIT 1",
        )
        .get()
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "A settlement is pending. Try again shortly.",
      );
    const prepared = prepareAsk(
      deps,
      user,
      key,
      size,
      price,
      preparedSignature.order.expiry,
      preparedSignature.order.nonce,
    );
    if (
      !(custody ?? settings.signer).verify(
        user.walletAddress,
        prepared.digest,
        signature,
        prepared.typedDataJson,
      )
    )
      throw new DomainError("INVALID_ARGUMENT", "Invalid ask signature.");
    if (options.signature && (options.nonce === undefined || !options.expiry))
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Signed asks require expiry and nonce.",
      );
    const initial = deps.ports.inventory.get(key);
    assertOpen(deps.ports, initial);
    const owned = syncPosition(deps, user, initial);
    if (size > owned.free + owned.escrow)
      throw new DomainError("FAILED_PRECONDITION", "Not enough room nights.");
    // Keep the existing one-listing-per-human behavior across linked wallets.
    deps.ports.db
      .query(
        "UPDATE market_signed_asks SET status = 'cancelled' WHERE night_key = ? AND human_id = ?",
      )
      .run(key, user.humanId);
    // Retire the previous listing before replacing it, without executing a fill.
    deps.ports.db
      .query("DELETE FROM market_signed_asks WHERE night_key = ? AND maker = ?")
      .run(key, user.walletAddress);
    const record = deps.ports.inventory.update(key, (current) => {
      assertOpen(deps.ports, current);
      const position = owned;
      if (size > position.free + position.escrow)
        throw new DomainError("FAILED_PRECONDITION", "Not enough room nights.");
      const wallets = humanWallets(deps.ports, user, current.propertyId);
      const traderAsks = current.state.traderAsks.filter(
        (a) => !wallets.has(a.who ?? ""),
      );
      traderAsks.push({
        who: user.walletAddress,
        size: size / 10,
        price: Number(price) / 1e6,
      });
      return { ...current, state: { ...current.state, traderAsks } };
    });
    const position = deps.repo.position(user.humanId, key);
    position.free += position.escrow;
    position.escrow = 0;
    deps.ports.db
      .query(`INSERT INTO market_signed_asks
      (night_key, maker, human_id, size, remaining, price, expiry, nonce, digest, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        key,
        user.walletAddress,
        user.humanId,
        size,
        size,
        price,
        prepared.expires,
        prepared.order.nonce,
        prepared.digest,
        signature,
      );
    position.askPrice = price;
    deps.ports.activity.append({
      nightKey: key,
      propertyId: record.propertyId,
      kind: "ask_posted",
      actor: "trader",
      userId: user.id,
      tenths: size,
      priceMicros: price,
    });
    return {
      ask: prepared.order,
      isAboveTwiceFair: price > 2n * toMicros(record.state.pstar),
      isAboveRecallCap:
        price > toMicros(recallStrike(record.state.F, record.state.k)),
    };
  });
}
