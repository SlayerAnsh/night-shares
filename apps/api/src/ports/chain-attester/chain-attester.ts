import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import type { WalkAttestation } from "../chain-executor/chain-executor";
import type { WalletCustody } from "../wallet-custody/wallet-custody";
export type Attestation =
  | {
      kind: "link" | "relink";
      humanId: bigint;
      wallet: Address;
      deadline: bigint;
    }
  | { kind: "linkGuest"; guestId: bigint; wallet: Address; deadline: bigint }
  | { kind: "bind"; property: Hex; hostPayout: Address; deadline: bigint }
  | { kind: "walk"; report: WalkAttestation };
export interface ChainAttester {
  readonly address: Address;
  sign(attestation: Attestation): Promise<Hex>;
}
export function createChainAttester(
  d: ArcDeployment,
  getKey: () => Hex,
): { attester: ChainAttester; custody: WalletCustody } {
  const account = privateKeyToAccount(getKey());
  if (account.address.toLowerCase() !== d.ATTESTER.toLowerCase())
    throw new Error("FORK_ATTESTER_KEY does not match deployment ATTESTER.");
  const wallet = { walletId: "fork:attester", address: account.address };
  const requireWallet = (id: string) => {
    if (id !== wallet.walletId) throw new Error("Unknown attester wallet.");
  };
  return {
    attester: {
      address: account.address,
      async sign(a) {
        const primaryType =
          a.kind === "linkGuest"
            ? "LinkGuest"
            : a.kind === "link"
              ? "LinkWallet"
              : a.kind === "relink"
                ? "RelinkWallet"
                : a.kind === "bind"
                  ? "BindProperty"
                  : "WalkAttestation";
        const fields =
          a.kind === "walk"
            ? [
                ["reportId", "bytes32"],
                ["bookingId", "bytes32"],
                ["property", "bytes32"],
                ["guest", "address"],
                ["paid", "uint256"],
                ["evidenceHash", "bytes32"],
                ["reportedAt", "uint64"],
                ["deadline", "uint64"],
              ]
            : a.kind === "bind"
              ? [
                  ["property", "bytes32"],
                  ["hostPayout", "address"],
                  ["deadline", "uint64"],
                ]
              : [
                  [a.kind === "linkGuest" ? "guestId" : "humanId", "uint256"],
                  ["wallet", "address"],
                  ["deadline", "uint64"],
                ];
        const message =
          a.kind === "walk"
            ? a.report
            : a.kind === "bind"
              ? {
                  property: a.property,
                  hostPayout: a.hostPayout,
                  deadline: a.deadline,
                }
              : a.kind === "linkGuest"
                ? { guestId: a.guestId, wallet: a.wallet, deadline: a.deadline }
                : {
                    humanId: a.humanId,
                    wallet: a.wallet,
                    deadline: a.deadline,
                  };
        return account.signTypedData({
          domain: {
            name: "NightShares",
            version: "1",
            chainId: 5042,
            verifyingContract:
              a.kind === "walk"
                ? d.Settlement
                : a.kind === "bind"
                  ? d.NightFactory
                  : d.HumanRegistry,
          },
          types: {
            [primaryType]: fields.map(([name, type]) => ({
              name: name as string,
              type: type as string,
            })),
          },
          primaryType,
          message,
        });
      },
    },
    custody: {
      async createWallet() {
        return wallet;
      },
      async getWallet() {
        return wallet;
      },
      async resolveWallet(id) {
        requireWallet(id);
        return wallet;
      },
      async signTypedData() {
        throw new Error("Use the typed attestation port.");
      },
      async signTransaction(id, tx) {
        requireWallet(id);
        return account.signTransaction(tx);
      },
    },
  };
}
