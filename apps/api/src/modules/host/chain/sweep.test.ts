import { expect, test } from "bun:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  parseAbi,
  type TransactionReceipt,
  toBytes,
} from "viem";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { fixture } from "../use-cases/fixture";
import { sweepChain } from "./sweep";

test("sweep waits for receipt, nets actual debt and never settles mock money", async () => {
  const deps = fixture();
  const { ports, userId, key } = deps;
  ports.inventory.get(key);
  const wallet = {
    walletId: "host-wallet",
    address: "0x0000000000000000000000000000000000000001" as const,
  };
  const vault = "0x0000000000000000000000000000000000000002" as const;
  ports.db
    .query(
      "INSERT INTO identity_users (id, human_id, wallet_address, level) VALUES (?, ?, ?, 'orb')",
    )
    .run(userId, "42", wallet.address);
  ports.walletProvider.custody = {
    async getWallet() {
      return wallet;
    },
    async resolveWallet() {
      return wallet;
    },
    async createWallet() {
      return wallet;
    },
    async signTypedData() {
      return "0x";
    },
  };
  ports.walletProvider.settle = async () => {
    throw new Error("Mock settlement forbidden");
  };
  const block = {
    number: 1n,
    hash: `0x${"00".repeat(32)}` as const,
    timestamp: 1n,
  };
  ports.chainReader = {
    fingerprint: "test-sweep",
    async head() {
      return block;
    },
    async read<T>(request: Parameters<ChainReader["read"]>[0]) {
      return {
        block,
        value: (request.functionName === "humanIdOf"
          ? 42n
          : request.functionName === "dependencies"
            ? { vault }
            : true) as T,
      };
    },
  } as ChainReader;
  ports.chainAttester = {
    address: wallet.address,
    async sign() {
      return "0x";
    },
  };
  ports.db
    .query("INSERT INTO host_chain_openings VALUES (?, ?, ?, ?, 'complete')")
    .run("test-sweep", key, userId, "{}");
  const property = keccak256(toBytes("prop_velana"));
  const event = parseAbi([
    "event Swept(bytes32 indexed property,address indexed owner,uint256 amount,uint256 hostDebtNetted)",
  ]);
  const receipt = {
    status: "success",
    logs: [
      {
        address: vault,
        topics: encodeEventTopics({
          abi: event,
          eventName: "Swept",
          args: { property, owner: wallet.address },
        }),
        data: encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [100n, 30n],
        ),
      },
    ],
  } as unknown as TransactionReceipt;
  let mined = false;
  ports.chainExecutor = {
    mode: "chain",
    pending: () => [],
    async recover() {
      throw new Error("unused");
    },
    async execute(request) {
      return {
        operationId: request.operationId,
        fingerprint: "test-sweep",
        state: mined ? "finalized" : "needs_reconciliation",
        receipt: mined ? receipt : undefined,
      };
    },
  };
  await expect(sweepChain(deps, userId, "prop_velana")).rejects.toThrow(
    "needs_reconciliation",
  );
  expect(deps.repo.withdrawn("prop_velana")).toBe(0n);
  expect(
    ports.db.query("SELECT * FROM host_sweeps WHERE status = 'pending'").all(),
  ).toHaveLength(1);
  mined = true;
  await sweepChain(deps, userId, "prop_velana");
  expect(deps.repo.withdrawn("prop_velana")).toBe(70n);
  expect(
    ports.db.query("SELECT * FROM host_sweeps WHERE status = 'pending'").all(),
  ).toHaveLength(0);
  ports.db.close();
});
