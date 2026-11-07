import {
  type Address,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";
import { ensureChainIdentity } from "../../identity/chain-ready";
import type { HostDeps } from "../use-cases/deps";
import { chainPorts, executeIntent } from "./execute";

export async function hostWallet({ ports }: HostDeps, userId: string) {
  const user = ports.db
    .query<User, [string]>(
      "SELECT id, human_id AS humanId, wallet_address AS walletAddress, level FROM identity_users WHERE id = ?",
    )
    .get(userId);
  if (user?.level !== "orb")
    throw new DomainError(
      "PERMISSION_DENIED",
      "An Orb-verified host is required.",
    );
  await ensureChainIdentity(ports, user);
  const saved = ports.db
    .query<{ wallet_id: string }, [string, string]>(
      "SELECT wallet_id FROM identity_chain_ids WHERE fingerprint = ? AND user_id = ?",
    )
    .get(chainPorts(ports).reader.fingerprint, userId);
  const wallet = saved
    ? await ports.walletProvider.custody?.resolveWallet?.(saved.wallet_id)
    : undefined;
  if (!wallet) throw new Error("Host custody unavailable.");
  return wallet;
}

export async function bindProperty(
  deps: HostDeps,
  userId: string,
  propertyId: string,
  payout: string,
) {
  const { ports, repo } = deps;
  if (repo.owner(propertyId) !== userId)
    throw new DomainError(
      "PERMISSION_DENIED",
      "Only the property host can bind its payout address.",
    );
  if (!isAddress(payout) || payout === zeroAddress)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Enter a valid permanent host payout address.",
    );
  const hostPayout = getAddress(payout);
  const { reader, attester } = chainPorts(ports);
  await hostWallet(deps, userId);
  const previous = ports.db
    .query<{ payout: string }, [string, string]>(
      "SELECT payout FROM host_chain_bindings WHERE fingerprint = ? AND property_id = ?",
    )
    .get(reader.fingerprint, propertyId);
  if (previous && previous.payout !== hostPayout)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Property payout binding is permanent.",
    );
  const property = keccak256(toBytes(propertyId));
  const owner = (
    await reader.read<Address>({
      contract: "NightFactory",
      functionName: "ownerOf",
      args: [property],
    })
  ).value;
  if (owner !== zeroAddress && owner.toLowerCase() !== hostPayout.toLowerCase())
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Property payout binding is permanent.",
    );
  ports.db
    .query("INSERT OR IGNORE INTO host_chain_bindings VALUES (?, ?, ?, ?)")
    .run(reader.fingerprint, propertyId, userId, hostPayout);
  if (owner === zeroAddress)
    await executeIntent(ports, `bind:${propertyId}`, async () => {
      const a = {
        kind: "bind" as const,
        property,
        hostPayout,
        deadline: (await reader.head()).timestamp + 3600n,
      };
      return {
        operationId: "",
        walletId: "fork:attester",
        command: { ...a, signature: await attester.sign(a) },
      };
    });
  if (
    (
      await reader.read<Address>({
        contract: "NightFactory",
        functionName: "ownerOf",
        args: [property],
      })
    ).value.toLowerCase() !== hostPayout.toLowerCase()
  )
    throw new Error("Property binding read-back failed.");
}
