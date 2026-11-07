import { expect, test } from "bun:test";
import { type Address, hashDomain } from "viem";
import { executionFixture } from "../../../ports/arc-deployment/fixture";
import type { ForkClient } from "../../../ports/arc-deployment/validate";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { fixture } from "../testing/fixture";
import { chainMarket, configureChainMarket } from "./runtime";

test("authorization checks each token domain before signing, caches successes, retries failures", async () => {
  const { ports } = await fixture();
  try {
    const d = executionFixture();
    ports.chainReader = { fingerprint: "domains" } as ChainReader;
    ports.chainExecutor = { mode: "chain" } as NonNullable<
      typeof ports.chainExecutor
    >;
    const domain = (address: Address) => ({
      name: "NightShares Room Night",
      version: "1",
      chainId: BigInt(d.chainId),
      verifyingContract: address,
    });
    const fields = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ] as const;
    let reads = 0,
      signs = 0,
      valid = true;
    configureChainMarket(ports, {
      deployment: d,
      client: {
        readContract: async ({ address }: { address: Address }) => {
          reads++;
          return valid
            ? hashDomain({
                domain: domain(address),
                types: { EIP712Domain: fields },
              })
            : "0x";
        },
      } as unknown as ForkClient,
      custody: {
        getWallet: async () => undefined,
        createWallet: async () => {
          throw new Error("unused");
        },
        signTypedData: async () => {
          signs++;
          return "0x";
        },
      },
    });
    const sign = (token: Address) =>
      chainMarket(ports).custody.signTypedData("wallet", {
        domain: domain(token),
        types: { ReceiveWithAuthorization: [] },
        primaryType: "ReceiveWithAuthorization",
        message: {},
      });
    await sign(d.NightToken);
    await sign(d.NightToken);
    expect(reads).toBe(1);
    valid = false;
    await expect(sign(d.NightVault)).rejects.toThrow("domain mismatch");
    expect(signs).toBe(2);
    valid = true;
    await sign(d.NightVault);
    expect(reads).toBe(3);
    expect(signs).toBe(3);
  } finally {
    ports.db.close();
  }
});
