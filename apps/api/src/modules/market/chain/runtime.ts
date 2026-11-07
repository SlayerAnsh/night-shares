import type { Address } from "viem";
import { keccak256, stringToHex } from "viem";
import type { Ports } from "../../../container/ports";
import type { ArcDeployment } from "../../../ports/arc-deployment/arc-deployment";
import {
  type ForkClient,
  forkClient,
} from "../../../ports/arc-deployment/validate";
import {
  deserialize,
  type ExecutionResult,
} from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import type { WalletCustody } from "../../../ports/wallet-custody/wallet-custody";
import { DomainError } from "../../../shared/errors/domain-error";

type Settings = {
  network?: "fork" | "testnet" | "mainnet";
  client?: ForkClient;
  custody: WalletCustody;
  deployment: ArcDeployment;
  slippageBps?: number;
};
const settings = new WeakMap<Ports, Settings>();
export function configureChainMarket(ports: Ports, value: Settings) {
  slippageBounds(0n, value.slippageBps);
  settings.set(ports, value);
}
export const isChain = (ports: Ports) => ports.chainExecutor?.mode === "chain";
export const nightHash = (key: string) => keccak256(stringToHex(key));
export function chainMarket(ports: Ports) {
  let configured = settings.get(ports);
  if (
    !configured &&
    isChain(ports) &&
    ports.chainReader &&
    ports.walletProvider.custody
  ) {
    const row = ports.db
      .query<{ deployment: string }, [string]>(
        "SELECT deployment FROM chain_instances WHERE fingerprint = ? AND active = 1",
      )
      .get(ports.chainReader.fingerprint);
    if (row) {
      const raw = process.env.MARKET_SLIPPAGE_BPS;
      configured = {
        custody: ports.walletProvider.custody,
        deployment: deserialize<ArcDeployment>(row.deployment),
        slippageBps: raw === undefined ? 50 : Number(raw),
      };
      configureChainMarket(ports, configured);
    }
  }
  if (!configured || !ports.chainExecutor || !ports.chainReader)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Chain market custody and deployment must be configured.",
    );
  return {
    ...configured,
    client:
      configured.client ??
      forkClient(process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545"),
    executor: ports.chainExecutor,
    reader: ports.chainReader,
  };
}
export function slippageBounds(amount: bigint, bps = 50) {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000 || amount < 0n)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Slippage must be between 0 and 10000 basis points.",
    );
  return {
    max: (amount * BigInt(10000 + bps) + 9999n) / 10000n,
    min: (amount * BigInt(10000 - bps)) / 10000n,
  };
}
export async function userWallet(ports: Ports, user: User) {
  const wallet = await chainMarket(ports).custody.getWallet({
    kind: "user",
    humanId: user.humanId,
  });
  if (
    !wallet ||
    wallet.address.toLowerCase() !== user.walletAddress.toLowerCase()
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "This wallet is not available in custody.",
    );
  return wallet;
}
export function confirmed(result: ExecutionResult) {
  if (result.state === "reverted")
    throw new DomainError("FAILED_PRECONDITION", "Chain transaction reverted.");
  if (result.state !== "finalized" || result.receipt?.status !== "success")
    throw new DomainError(
      "FAILED_PRECONDITION",
      `Chain operation ${result.operationId} is pending reconciliation.`,
    );
  return result.receipt;
}
export async function assertOrb(ports: Ports, wallet: Address) {
  const { reader } = chainMarket(ports);
  if (
    !(
      await reader.read<boolean>({
        contract: "HumanRegistry",
        functionName: "isOrb",
        args: [wallet],
      })
    ).value
  )
    throw new DomainError(
      "PERMISSION_DENIED",
      "An on-chain Orb credential is required to trade.",
    );
}

export function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}
