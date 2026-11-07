import { expect, test } from "bun:test";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { fixture } from "../use-cases/fixture";
import { executeIntent } from "./execute";

test("ambiguous chain delivery retains one immutable intent across restart", async () => {
  const { ports } = fixture();
  ports.chainReader = { fingerprint: "deployment-one" } as ChainReader;
  ports.chainAttester = {
    address: "0x0000000000000000000000000000000000000001",
    async sign() {
      return "0x12";
    },
  };
  let prepared = 0;
  const requests: string[] = [];
  ports.chainExecutor = {
    mode: "chain",
    pending: () => [],
    async recover() {
      throw new Error("unused");
    },
    async execute(request) {
      requests.push(request.walletId);
      return {
        fingerprint: "deployment-one",
        operationId: request.operationId,
        state: "needs_reconciliation",
      };
    },
  };
  const prepare = async () => {
    prepared++;
    return {
      operationId: "",
      walletId: `wallet-${prepared}`,
      command: { kind: "cancelAll" as const },
    };
  };
  await expect(executeIntent(ports, "same-request", prepare)).rejects.toThrow(
    "needs_reconciliation",
  );
  await expect(executeIntent(ports, "same-request", prepare)).rejects.toThrow(
    "needs_reconciliation",
  );
  expect(prepared).toBe(1);
  expect(requests).toEqual(["wallet-1", "wallet-1"]);
  expect(ports.db.query("SELECT * FROM host_chain_intents").all()).toHaveLength(
    1,
  );
  ports.db.close();
});
