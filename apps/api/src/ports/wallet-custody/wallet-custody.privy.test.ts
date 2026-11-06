import { expect, test } from "bun:test";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { orderTypedData } from "../../modules/market/orders/typed-data";
import { createPrivyWalletCustody } from "./wallet-custody.privy";

const owner = { kind: "user" as const, humanId: "alice" };
const wallet = {
  id: "wallet_1",
  address: `0x${"11".repeat(20)}` as const,
  chain_type: "ethereum",
};
const data = JSON.parse(
  orderTypedData(
    {
      night: "night",
      size: 1,
      price: 1n,
      expiry: 1800000000000,
      nonce: 0n,
      maker: wallet.address,
    },
    { chainId: 5042, verifyingContract: `0x${"00".repeat(20)}` },
  ).typedDataJson,
);

test("Privy create uses Basic auth, Ethereum, stable external ID and idempotency key", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const adapter = createPrivyWalletCustody({
    appId: "app_test",
    appSecret: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return init?.method === "GET"
        ? new Response(null, { status: 404 })
        : Response.json(wallet);
    },
  });
  expect(await adapter.createWallet(owner)).toEqual({
    walletId: wallet.id,
    address: wallet.address,
  });
  await adapter.createWallet(owner);
  const id = createHash("sha256").update("user:alice").digest("hex");
  expect(calls[0]?.url).toBe(`https://api.privy.io/v1/wallets/ext_wal_${id}`);
  expect(calls[1]?.init?.headers).toMatchObject({
    Authorization: `Basic ${Buffer.from("app_test:secret").toString("base64")}`,
    "privy-app-id": "app_test",
    "privy-idempotency-key": `night-shares-${id}`,
  });
  expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
    chain_type: "ethereum",
    external_id: id,
  });
  expect(calls[1]?.init?.body).toBe(calls[3]?.init?.body);
  expect(calls[1]?.init?.headers).toEqual(calls[3]?.init?.headers);
});

test("Privy recovers existing wallet without another creation", async () => {
  let calls = 0;
  const adapter = createPrivyWalletCustody({
    appId: "app",
    appSecret: "secret",
    fetch: async (_, init) => {
      calls++;
      expect(init?.method).toBe("GET");
      return Response.json(wallet);
    },
  });
  expect((await adapter.createWallet(owner)).walletId).toBe(wallet.id);
  expect(calls).toBe(1);
});

test("Privy typed data request preserves integer strings and uses primary_type", async () => {
  const signature = `0x${"12".repeat(65)}` as const;
  const adapter = createPrivyWalletCustody({
    appId: "app",
    appSecret: "secret",
    fetch: async (url, init) => {
      expect(String(url)).toBe("https://api.privy.io/v1/wallets/wallet_1/rpc");
      const { primaryType, ...rest } = data;
      expect(JSON.parse(String(init?.body))).toEqual({
        method: "eth_signTypedData_v4",
        params: { typed_data: { ...rest, primary_type: primaryType } },
      });
      return Response.json({
        method: "eth_signTypedData_v4",
        data: { signature, encoding: "hex" },
      });
    },
  });
  expect(await adapter.signTypedData(wallet.id, data)).toBe(signature);
});

test("authorization key signs canonical payload including Privy headers", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const encoded = pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");
  const adapter = createPrivyWalletCustody({
    appId: "app",
    appSecret: "secret",
    authorizationKey: `wallet-auth:${encoded}`,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body));
      const payload = {
        version: 1,
        method: "POST",
        url: String(url),
        body,
        headers: { "privy-app-id": "app" },
      };
      // Use code-unit sorting as required by RFC 8785, independently of locale.
      function canonical(value: unknown): unknown {
        if (Array.isArray(value)) return value.map(canonical);
        if (value && typeof value === "object")
          return Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [
                key,
                canonical((value as Record<string, unknown>)[key]),
              ]),
          );
        return value;
      }
      expect(
        verify(
          "sha256",
          Buffer.from(JSON.stringify(canonical(payload))),
          pair.publicKey,
          Buffer.from(
            headers.get("privy-authorization-signature") ?? "",
            "base64",
          ),
        ),
      ).toBe(true);
      return Response.json({
        method: "eth_signTypedData_v4",
        data: { signature: `0x${"12".repeat(65)}`, encoding: "hex" },
      });
    },
  });
  await adapter.signTypedData(wallet.id, data);
});

test("Privy failures redact secrets and malformed signatures fail closed", async () => {
  for (const response of [
    new Response("secret", { status: 403 }),
    Response.json({ data: { signature: "bad" } }),
  ]) {
    const adapter = createPrivyWalletCustody({
      appId: "app",
      appSecret: "secret",
      fetch: async () => response,
    });
    await expect(adapter.signTypedData(wallet.id, data)).rejects.toThrow(
      "Wallet service rejected",
    );
  }
});
