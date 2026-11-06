import { expect, test } from "bun:test";
import { privateKeyToAccount } from "viem/accounts";
import { openDatabase } from "../../db/open-database";
import { orderTypedData } from "../../modules/market/orders/typed-data";
import { persistWalletCustody } from "../wallet-custody/wallet-custody.sqlite";
import { createPrivyOrderSigner } from "./order-signer.privy";

test("Privy order signer verifies EIP-712 and rejects changed maker, domain, data and HMAC", async () => {
  const db = openDatabase(":memory:");
  const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
  try {
    const custody = persistWalletCustody(db, "privy", {
      async getWallet() {
        return undefined;
      },
      async createWallet() {
        return { walletId: "privy-wallet", address: account.address };
      },
      async signTypedData(walletId, data) {
        expect(walletId).toBe("privy-wallet");
        return account.signTypedData(data);
      },
    });
    await custody.createWallet({ kind: "user", humanId: "alice" });
    const signer = createPrivyOrderSigner({ db, custody });
    const order = {
      night: "prop:room:2026-12-01",
      size: 3,
      price: 123456789n,
      expiry: 1800000000000,
      nonce: 0n,
      maker: account.address,
    };
    const domain = {
      chainId: 5042,
      verifyingContract: `0x${"00".repeat(20)}` as const,
    };
    const prepared = orderTypedData(order, domain);
    const signature = await signer.signCustodial(
      account.address,
      prepared.digest,
      prepared.typedDataJson,
    );
    expect(
      await signer.verify(
        account.address.toLowerCase(),
        prepared.digest,
        signature,
        prepared.typedDataJson,
      ),
    ).toBe(true);
    expect(
      await signer.verify(
        `0x${"02".repeat(20)}`,
        prepared.digest,
        signature,
        prepared.typedDataJson,
      ),
    ).toBe(false);
    for (const changed of [
      orderTypedData({ ...order, price: 1n }, domain),
      orderTypedData(order, { ...domain, chainId: 5042002 }),
    ])
      expect(
        await signer.verify(
          account.address,
          changed.digest,
          signature,
          changed.typedDataJson,
        ),
      ).toBe(false);
    expect(
      await signer.verify(
        account.address,
        prepared.digest,
        "mock:fake",
        prepared.typedDataJson,
      ),
    ).toBe(false);
    await expect(
      signer.signCustodial("unknown", prepared.digest, prepared.typedDataJson),
    ).rejects.toThrow("no Privy");
    await expect(
      signer.signCustodial(account.address, "wrong", prepared.typedDataJson),
    ).rejects.toThrow("digest");
  } finally {
    db.close();
  }
});
