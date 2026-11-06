import { expect, test } from "bun:test";
import { createMockClock } from "../../../ports/clock/clock.mock";
import { createMockIdGenerator } from "../../../ports/ids/id-generator.mock";
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
  ).toEqual({ balance: 12480000000n, walletAddress });
});
