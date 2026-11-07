import { expect, test } from "bun:test";
import { zeroAddress } from "viem";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { bindProperty } from "../chain/bind";
import { createSqliteHostRepo } from "../repo/host-repo.sqlite";
import { createConnectChannelManager } from "./connect-channel-manager";
import { fixture } from "./fixture";

for (const outcome of ["failed bind", "foreign owner", "success"]) {
  const foreignOwner = outcome === "foreign owner";
  test(`fork connection compensates or commits after ${outcome}`, async () => {
    const f = fixture();
    const { ports, userId } = f;
    const repo = createSqliteHostRepo(ports);
    const wallet = {
      walletId: "host",
      address: "0x0000000000000000000000000000000000000001" as const,
    };
    ports.db
      .query(
        "INSERT INTO identity_users (id, human_id, wallet_address, level) VALUES (?, '42', ?, 'orb')",
      )
      .run(userId, wallet.address);
    ports.walletProvider.custody = {
      getWallet: async () => wallet,
      resolveWallet: async () => wallet,
      createWallet: async () => wallet,
      signTypedData: async () => "0x",
    };
    const block = {
      number: 1n,
      timestamp: 1n,
      hash: `0x${"00".repeat(32)}` as const,
    };
    let bound = false;
    ports.chainReader = {
      fingerprint: "bind-test",
      head: async () => block,
      async read<T>(request: Parameters<ChainReader["read"]>[0]) {
        return {
          block,
          value: (request.functionName === "humanIdOf"
            ? 42n
            : request.functionName === "ownerOf"
              ? foreignOwner
                ? "0x0000000000000000000000000000000000000002"
                : bound
                  ? wallet.address
                  : zeroAddress
              : true) as T,
        };
      },
    } as ChainReader;
    ports.chainAttester = { address: wallet.address, sign: async () => "0x" };
    let transactions = 0;
    ports.chainExecutor = {
      mode: "chain",
      pending: () => [],
      recover: async () => {
        throw new Error("unused");
      },
      execute: async () => {
        transactions++;
        expect(repo.owner("prop_machiya")).toBe(userId);
        await expect(
          bindProperty(
            { ports, repo },
            "host-b",
            "prop_machiya",
            wallet.address,
          ),
        ).rejects.toThrow("Only the property host");
        await expect(
          createConnectChannelManager({ ports, repo })(
            "host-b",
            "prop_machiya",
            2,
            wallet.address,
          ),
        ).rejects.toThrow("another host");
        if (outcome !== "success") throw new Error("bind failed");
        bound = true;
        return {
          operationId: "bind:prop_machiya",
          state: "finalized",
          receipt: { status: "success" },
        } as never;
      },
    };
    try {
      await expect(
        bindProperty({ ports, repo }, userId, "prop_machiya", wallet.address),
      ).rejects.toThrow("Only the property host");
      const connection = createConnectChannelManager({ ports, repo })(
        userId,
        "prop_machiya",
        2,
        wallet.address,
      );
      if (outcome === "success") {
        await connection;
        expect(repo.owner("prop_machiya")).toBe(userId);
        expect(repo.connections(userId).has("prop_machiya")).toBe(true);
        await expect(
          bindProperty(
            { ports, repo },
            "host-b",
            "prop_machiya",
            wallet.address,
          ),
        ).rejects.toThrow("Only the property host");
      } else {
        await expect(connection).rejects.toThrow(
          foreignOwner ? "permanent" : "bind failed",
        );
        expect(repo.owner("prop_machiya")).toBeUndefined();
        expect(repo.connections(userId).has("prop_machiya")).toBe(false);
        expect(
          ports.db.query("SELECT * FROM host_chain_bindings").all(),
        ).toHaveLength(0);
      }
      expect(transactions).toBe(foreignOwner ? 0 : 1);
    } finally {
      ports.db.close();
    }
  });
}
