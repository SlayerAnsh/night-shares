import { expect, test } from "bun:test";
import { parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { TransactionEnvelope } from "./wallet-custody";
import { createPrivyWalletCustody } from "./wallet-custody.privy";

const account = privateKeyToAccount(`0x${"12".repeat(32)}`);
const tx: TransactionEnvelope = {
  chainId: 5042002,
  type: "eip1559",
  nonce: 3,
  to: account.address,
  data: "0x",
  value: 0n,
  gas: 21000n,
  maxFeePerGas: 10n,
  maxPriorityFeePerGas: 1n,
};
test("Privy signs explicit custom chains, retries identical envelopes with identical idempotency, never sends", async () => {
  const requests: RequestInit[] = [];
  const adapter = createPrivyWalletCustody({
    appId: "test",
    appSecret: "test",
    fetch: async (_, init) => {
      requests.push(init);
      const body = JSON.parse(String(init.body));
      expect(body.method).toBe("eth_signTransaction");
      expect(body.params.transaction).toEqual({
        chain_id: 5042002,
        type: 2,
        nonce: 3,
        to: account.address,
        data: "0x",
        value: "0x0",
        gas_limit: "0x5208",
        max_fee_per_gas: "0xa",
        max_priority_fee_per_gas: "0x1",
      });
      if (requests.length === 1) throw new Error("connection lost");
      return Response.json({
        method: body.method,
        data: {
          encoding: "rlp",
          signed_transaction: await account.signTransaction(tx),
        },
      });
    },
  });
  await expect(adapter.signTransaction("wallet", tx)).rejects.toThrow(
    "unavailable",
  );
  const signed = await adapter.signTransaction("wallet", tx);
  expect(parseTransaction(signed).chainId).toBe(5042002);
  expect(requests[0]?.body).toBe(requests[1]?.body);
  expect(requests[0]?.headers).toEqual(requests[1]?.headers);
});
test("Privy authorization failures name optional authorization env without leaking vendor errors", async () => {
  for (const status of [401, 403]) {
    const adapter = createPrivyWalletCustody({
      appId: "test",
      appSecret: "test",
      fetch: async () => new Response("secret vendor detail", { status }),
    });
    await expect(adapter.signTransaction("wallet", tx)).rejects.toThrow(
      "PRIVY_AUTHORIZATION_KEY",
    );
  }
});
test("Privy unsupported signing and malformed bytes fail closed without send fallback", async () => {
  for (const response of [
    new Response(null, { status: 400 }),
    Response.json({
      method: "eth_signTransaction",
      data: { encoding: "rlp", signed_transaction: "oops" },
    }),
  ]) {
    const adapter = createPrivyWalletCustody({
      appId: "test",
      appSecret: "test",
      fetch: async () => response,
    });
    await expect(adapter.signTransaction("wallet", tx)).rejects.toThrow(
      "rejected",
    );
  }
});
