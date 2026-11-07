import type { Address } from "viem";
import type { Ports } from "../../container/ports";
import type { User } from "../../ports/sessions/session-store";
import { DomainError } from "../../shared/errors/domain-error";
import { chainPorts, executeIntent } from "../host/chain/execute";

/** Enrollment nullifiers are uint256 values; session identifiers are never accepted. */
export function enrollmentId(subject: string): bigint {
  const value = /^[a-fA-F0-9]{64}$/.test(subject)
    ? BigInt(`0x${subject}`)
    : /^(0x[a-fA-F0-9]+|[0-9]+)$/.test(subject)
      ? BigInt(subject)
      : 0n;
  if (value <= 0n || value >= 1n << 256n)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "A canonical enrollment nullifier is required.",
    );
  return value;
}

export async function ensureChainIdentity(ports: Ports, user: User) {
  if (ports.chainExecutor?.mode !== "fork") return;
  // Selfie credentials use the separate guest namespace, linked at first booking.
  if (user.level !== "orb") return;
  const { reader, attester } = chainPorts(ports);
  const custody = ports.walletProvider.custody;
  const saved = ports.db
    .query<{ human_id: string; wallet_id: string }, [string, string]>(
      "SELECT human_id, wallet_id FROM identity_chain_ids WHERE fingerprint = ? AND user_id = ?",
    )
    .get(reader.fingerprint, user.id);
  const wallet = saved
    ? await custody?.resolveWallet?.(saved.wallet_id)
    : await custody?.getWallet({ kind: "user", humanId: user.humanId });
  if (
    !wallet ||
    wallet.address.toLowerCase() !== user.walletAddress.toLowerCase()
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "The enrollment custody wallet is unavailable.",
    );
  await ports.provisionWallet?.(wallet);
  const humanId = saved ? BigInt(saved.human_id) : enrollmentId(user.humanId);
  ports.db
    .query("INSERT OR IGNORE INTO identity_chain_ids VALUES (?, ?, ?, ?)")
    .run(reader.fingerprint, user.id, humanId.toString(), wallet.walletId);
  const linked = (
    await reader.read<bigint>({
      contract: "HumanRegistry",
      functionName: "humanIdOf",
      args: [wallet.address],
    })
  ).value;
  if (linked !== 0n && linked !== humanId)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Unsafe identity relink refused; existing holder attribution must be preserved.",
    );
  await ports.provisionWallet?.({
    walletId: "fork:attester",
    address: attester.address,
  });
  if (linked === 0n)
    await executeIntent(ports, `identity:${user.id}:link`, async () => {
      const a = {
        kind: "link" as const,
        humanId,
        wallet: wallet.address as Address,
        deadline: (await reader.head()).timestamp + 3600n,
      };
      return {
        operationId: "",
        walletId: "fork:attester",
        command: { ...a, signature: await attester.sign(a) },
      };
    });
  if (
    !(
      await reader.read<boolean>({
        contract: "HumanRegistry",
        functionName: "isOrb",
        args: [wallet.address],
      })
    ).value
  )
    await executeIntent(ports, `identity:${user.id}:orb`, async () => ({
      operationId: "",
      walletId: "fork:attester",
      command: { kind: "verifyHuman", humanId, orb: true },
    }));
  if (
    (
      await reader.read<bigint>({
        contract: "HumanRegistry",
        functionName: "humanIdOf",
        args: [wallet.address],
      })
    ).value !== humanId ||
    !(
      await reader.read<boolean>({
        contract: "HumanRegistry",
        functionName: "isOrb",
        args: [wallet.address],
      })
    ).value
  )
    throw new Error("Chain identity read-back failed.");
}
