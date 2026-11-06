import { expect, test } from "bun:test";
import { createOnchainUsdcBalance } from "./onchain-usdc-balance";

const address = `0x${"11".repeat(20)}`;

test("Arc balance reads ERC-20 micro USDC and retries -32014 with backoff", async () => {
  let calls = 0;
  const delays: number[] = [];
  const balance = createOnchainUsdcBalance("mainnet", undefined, {
    async wait(ms) {
      delays.push(ms);
    },
    async fetchFn(url, init) {
      expect(String(url)).toBe("https://rpc.mainnet.arc.io/");
      const request = JSON.parse(String(init?.body));
      expect(request.method).toBe("eth_call");
      expect(request.params[0].to).toBe(
        "0x3600000000000000000000000000000000000000",
      );
      expect(request.params[0].data).toBe(
        `0x70a08231${"0".repeat(24)}${address.slice(2)}`,
      );
      calls++;
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        ...(calls < 3
          ? { error: { code: -32014, message: "rate limited" } }
          : { result: `0x${1234567n.toString(16).padStart(64, "0")}` }),
      });
    },
  });
  expect(await balance(address)).toBe(1234567n);
  expect(delays).toEqual([250, 500]);
});
test("Arc balance fails soft on RPC errors and invalid addresses", async () => {
  const balance = createOnchainUsdcBalance("testnet", undefined, {
    async fetchFn() {
      throw new Error("offline");
    },
  });
  expect(await balance(address)).toBeNull();
  expect(await balance("pool")).toBeNull();
});
