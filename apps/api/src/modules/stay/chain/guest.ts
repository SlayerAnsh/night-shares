import type { Ports } from "../../../container/ports";
import {
  deserialize,
  type ExecutionRequest,
  serialize,
} from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import type { CustodyWallet } from "../../../ports/wallet-custody/wallet-custody";
import { DomainError } from "../../../shared/errors/domain-error";
import { enrollmentId } from "../../identity/chain-ready";
import { chainContext, confirmed } from "./context";

export async function ensureGuest(
  ports: Ports,
  user: User,
  wallet: CustodyWallet,
  operationId: string,
) {
  const { reader } = chainContext(ports);
  const id = enrollmentId(user.humanId);
  const linked = (
    await reader.read<bigint>({
      contract: "HumanRegistry",
      functionName: user.level === "orb" ? "humanIdOf" : "guestIdOf",
      args: [wallet.address],
    })
  ).value;
  if (linked !== 0n && linked !== id)
    throw new DomainError(
      "PERMISSION_DENIED",
      "Custody wallet belongs to a different chain identity.",
    );
  if (linked === 0n) await linkGuest(ports, user, wallet, id, operationId);
  const verified = (
    await reader.read<boolean>({
      contract: "HumanRegistry",
      functionName: "isVerified",
      args: [wallet.address],
    })
  ).value;
  if (!verified)
    throw new DomainError(
      "PERMISSION_DENIED",
      "Guest is not verified or is walk-banned on chain.",
    );
}

async function linkGuest(
  ports: Ports,
  user: User,
  wallet: CustodyWallet,
  id: bigint,
  operationId: string,
): Promise<void> {
  if (user.level === "orb")
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Complete Orb chain enrollment before booking.",
    );
  const { executor, reader } = chainContext(ports);
  const key = `${operationId}:link-guest`;
  const get = () =>
    ports.db
      .query<{ payload: string }, [string]>(
        "SELECT payload FROM stay_chain_guest_links WHERE operation_id = ?",
      )
      .get(key);
  let stored = get();
  if (!stored) {
    if (!ports.chainAttester)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Guest attester is unavailable.",
      );
    const deadline = (await reader.head()).timestamp + 600n;
    const signature = await ports.chainAttester.sign({
      kind: "linkGuest",
      guestId: id,
      wallet: wallet.address,
      deadline,
    });
    const request: ExecutionRequest = {
      operationId: key,
      walletId: wallet.walletId,
      command: {
        kind: "linkGuest",
        guestId: id,
        wallet: wallet.address,
        deadline,
        signature,
      },
    };
    ports.db
      .query("INSERT OR IGNORE INTO stay_chain_guest_links VALUES (?, ?)")
      .run(key, serialize(request));
    stored = get();
  }
  if (!stored) throw new Error("Guest link reservation is missing.");
  confirmed(
    await executor.execute(deserialize<ExecutionRequest>(stored.payload)),
  );
  const linked = (
    await reader.read<bigint>({
      contract: "HumanRegistry",
      functionName: "guestIdOf",
      args: [wallet.address],
    })
  ).value;
  if (linked !== id)
    throw new Error(
      "Guest link receipt did not establish the enrollment nullifier.",
    );
}
