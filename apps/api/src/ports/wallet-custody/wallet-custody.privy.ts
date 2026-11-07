import { createHash } from "node:crypto";
import { DomainError } from "../../shared/errors/domain-error";
import { privyAuthorization } from "./privy-authorization";
import {
  type CustodyWallet,
  ownerKey,
  type WalletCustody,
} from "./wallet-custody";

export function createPrivyWalletCustody(deps: {
  appId: string;
  appSecret: string;
  authorizationKey?: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
}): WalletCustody {
  if (!deps.appId.trim() || !deps.appSecret.trim())
    throw new Error(
      "PRIVY_APP_ID and PRIVY_APP_SECRET are required in privy mode.",
    );
  const authorization = deps.authorizationKey
    ? privyAuthorization(deps.authorizationKey)
    : undefined;
  const request = deps.fetch ?? fetch;
  async function call(path: string, body?: object, idempotency?: string) {
    const url = `https://api.privy.io/v1/wallets${path}`;
    const privyHeaders: Record<string, string> = { "privy-app-id": deps.appId };
    if (idempotency) privyHeaders["privy-idempotency-key"] = idempotency;
    const headers: Record<string, string> = {
      ...privyHeaders,
      Authorization: `Basic ${Buffer.from(`${deps.appId}:${deps.appSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    };
    if (body && authorization)
      headers["privy-authorization-signature"] = authorization.sign(
        url,
        body,
        privyHeaders,
      );
    try {
      return await request(url, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // Do not expose vendor errors that could contain request credentials.
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Wallet service is unavailable. Please retry.",
      );
    }
  }
  function failure(): never {
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Wallet service rejected the request. Please retry.",
    );
  }
  async function wallet(response: Response): Promise<CustodyWallet> {
    if (!response.ok) return failure();
    const data = await response.json();
    if (
      typeof data.id !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(data.address) ||
      data.chain_type !== "ethereum"
    )
      return failure();
    return { walletId: data.id, address: data.address };
  }
  const externalId = (owner: Parameters<WalletCustody["createWallet"]>[0]) =>
    createHash("sha256").update(ownerKey(owner)).digest("hex");
  async function getWallet(owner: Parameters<WalletCustody["getWallet"]>[0]) {
    const response = await call(`/ext_wal_${externalId(owner)}`);
    return response.status === 404 ? undefined : wallet(response);
  }
  return {
    async resolveWallet(id) {
      return wallet(await call(`/${encodeURIComponent(id)}`));
    },
    async signTransaction() {
      throw new Error("Privy transaction sending not implemented");
    },
    getWallet,
    async createWallet(owner) {
      const existing = await getWallet(owner);
      if (existing) return existing;
      const id = externalId(owner);
      const response = await call(
        "",
        {
          chain_type: "ethereum",
          external_id: id,
          ...(authorization
            ? { owner: { public_key: authorization.publicKey } }
            : {}),
        },
        `night-shares-${id}`,
      );
      // A competing process or an expired idempotency key may hit uniqueness.
      if (!response.ok) return (await getWallet(owner)) ?? failure();
      return wallet(response);
    },
    async signTypedData(walletId, typedData) {
      const { primaryType, ...rest } = typedData;
      const body = JSON.parse(
        JSON.stringify(
          {
            method: "eth_signTypedData_v4",
            params: { typed_data: { ...rest, primary_type: primaryType } },
          },
          (_, value) => (typeof value === "bigint" ? value.toString() : value),
        ),
      );
      const response = await call(`/${encodeURIComponent(walletId)}/rpc`, body);
      if (!response.ok) return failure();
      const data = await response.json();
      const signature: unknown = data.data?.signature;
      if (
        data.method !== "eth_signTypedData_v4" ||
        data.data?.encoding !== "hex" ||
        typeof signature !== "string" ||
        !/^0x[0-9a-fA-F]{130}$/.test(signature)
      )
        return failure();
      return signature as `0x${string}`;
    },
  };
}
