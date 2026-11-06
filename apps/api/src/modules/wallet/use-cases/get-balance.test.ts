import { expect, test } from "bun:test";
import { createMockClock } from "../../../ports/clock/clock.mock";
import { createMockIdGenerator } from "../../../ports/ids/id-generator.mock";
import { SYSTEM_ADDRESSES } from "../../../ports/wallet-provider/wallet-provider";
import { createMockWalletProvider } from "../../../ports/wallet-provider/wallet-provider.mock";
import { createGetBalance } from "./get-balance";

test("reads the signed-in wallet in bigint micros", async () => {
  const walletProvider = createMockWalletProvider({
    clock: createMockClock(0),
    ids: createMockIdGenerator(),
  });
  const walletAddress = await walletProvider.linkWallet("alice");
  expect(
    await createGetBalance({ walletProvider })({
      id: "usr",
      humanId: "alice",
      level: "device",
      walletAddress,
    }),
  ).toEqual({
    balance: 12480000000n,
    walletAddress,
    onchainUsdcBalance: null,
    explorerUrl: "",
    systemWallets: Object.values(SYSTEM_ADDRESSES)
      .sort()
      .map((name) => ({ name, walletAddress: "", explorerUrl: "" })),
  });
});

test("lazy system creation preserves sorted wallet names without creating wallets on reads", async () => {
  const walletProvider = createMockWalletProvider({
    clock: createMockClock(0),
    ids: createMockIdGenerator(),
  });
  const { createMockWalletCustody } = await import(
    "../../../ports/wallet-custody/wallet-custody.mock"
  );
  const custody = createMockWalletCustody();
  walletProvider.custody = custody;
  walletProvider.explorerUrl = "https://explorer.arc.io";
  const user = {
    id: "usr",
    humanId: "alice",
    level: "device" as const,
    walletAddress: await walletProvider.linkWallet("alice"),
  };
  const read = createGetBalance({ walletProvider });
  const before = await read(user);
  expect(
    before.systemWallets.every((wallet) => wallet.walletAddress === ""),
  ).toBe(true);
  const pool = await custody.createWallet({ kind: "system", name: "pool" });
  const after = await read(user);
  expect(after.systemWallets.map((wallet) => wallet.name)).toEqual(
    before.systemWallets.map((wallet) => wallet.name),
  );
  expect(after.systemWallets.find((wallet) => wallet.name === "pool")).toEqual({
    name: "pool",
    walletAddress: pool.address,
    explorerUrl: `https://explorer.arc.io/address/${pool.address}`,
  });
  expect(
    await custody.getWallet({ kind: "system", name: "treasury" }),
  ).toBeUndefined();
});
