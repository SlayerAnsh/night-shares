import type { Database } from "bun:sqlite";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import {
  type CustodyWallet,
  ownerKey,
  type WalletCustody,
} from "./wallet-custody";

export const ANVIL_MNEMONIC =
  "test test test test test test test test test test test junk";
export const anvilAccount = (index: number) =>
  mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
// The deployment does not include MockUSDC. This signature is from its contract ABI.
const mockUsdcAbi = parseAbi(["function mint(address to, uint256 amount)"]);
export function createAnvilWalletCustody(deps: {
  db: Database;
  network: string;
  deployment: ArcDeployment;
  rpcUrl: string;
  faucet?: boolean;
}): WalletCustody {
  if (deps.network !== "fork")
    throw new Error("Anvil custody requires ARC_NETWORK=fork.");
  const { db } = deps;
  // This adapter owns its local development allocation store, independent of production custody.
  db.exec(`CREATE TABLE IF NOT EXISTS anvil_wallets (
    owner TEXT PRIMARY KEY, derivation_index INTEGER NOT NULL UNIQUE CHECK (derivation_index >= 100),
    wallet_id TEXT NOT NULL UNIQUE, address TEXT NOT NULL UNIQUE
  )`);
  const get = (owner: string) =>
    db
      .query<CustodyWallet, [string]>(
        "SELECT wallet_id AS walletId, address FROM anvil_wallets WHERE owner = ?",
      )
      .get(owner) ?? undefined;
  const allocate = db.transaction((owner: string) => {
    const existing = get(owner);
    if (existing) return { wallet: existing, created: false };
    const index = db
      .query<{ next: number }, []>(
        "SELECT COALESCE(MAX(derivation_index) + 1, 100) AS next FROM anvil_wallets",
      )
      .get()?.next;
    if (index === undefined)
      throw new Error("Cannot allocate Anvil wallet index.");
    const wallet = {
      walletId: `anvil:${index}`,
      address: anvilAccount(index).address,
    };
    db.query("INSERT INTO anvil_wallets VALUES (?, ?, ?, ?)").run(
      owner,
      index,
      wallet.walletId,
      wallet.address,
    );
    return { wallet, created: true };
  });
  return {
    async getWallet(owner) {
      return get(ownerKey(owner));
    },
    async createWallet(owner) {
      const { wallet, created } = allocate.immediate(ownerKey(owner));
      if (created && deps.faucet) {
        const chain = defineChain({
          id: 5042,
          name: "Arc fork",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: { default: { http: [deps.rpcUrl] } },
        });
        const client = createPublicClient({
          chain,
          transport: http(deps.rpcUrl),
        });
        if ((await client.getChainId()) !== 5042)
          throw new Error("Fork faucet RPC chainId must equal 5042.");
        const sender = createWalletClient({
          chain,
          account: anvilAccount(0),
          transport: http(deps.rpcUrl),
        });
        const hash = await sender.writeContract({
          address: deps.deployment.USDC,
          abi: mockUsdcAbi,
          functionName: "mint",
          args: [wallet.address, 100_000_000n],
        });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("Fork USDC faucet mint reverted.");
      }
      return wallet;
    },
    async signTypedData(walletId, data) {
      const row = db
        .query<{ index: number }, [string]>(
          "SELECT derivation_index AS 'index' FROM anvil_wallets WHERE wallet_id = ?",
        )
        .get(walletId);
      if (!row) throw new Error("Unknown anvil custody wallet.");
      return anvilAccount(row.index).signTypedData(data);
    },
  };
}
