import { expect, test } from "bun:test";
import { fromUsd } from "../../shared/money";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createMockOnramp } from "../onramp/onramp.mock";
import { createMockWalletProvider } from "./wallet-provider.mock";

test("wallet linking is stable and card charges credit the same transfer balance", async () => {
  const ids = createMockIdGenerator();
  const wallet = createMockWalletProvider({ ids });
  const address = await wallet.linkWallet("alice");
  expect(await wallet.linkWallet("alice")).toBe(address);
  expect(await wallet.balance(address)).toBe(fromUsd(12_480));
  const onramp = createMockOnramp({ ids, wallet });
  await onramp.chargeCard({ amount: fromUsd(20), address });
  await wallet.transfer(address, "pool", fromUsd(10), "buy");
  expect(await wallet.balance(address)).toBe(fromUsd(12_490));
  await expect(
    wallet.transfer(address, "host", fromUsd(50_000), "buy"),
  ).rejects.toThrow("Insufficient");
  await expect(wallet.transfer(address, "missing", 1n, "buy")).rejects.toThrow(
    "Wallet not found",
  );
  expect(await wallet.balance(address)).toBe(fromUsd(12_490));
});
