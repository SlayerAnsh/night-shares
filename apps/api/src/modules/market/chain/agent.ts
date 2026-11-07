import type { Address } from "viem";
import {
  deserialize,
  serialize,
} from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";
import { agentWallets } from "../repo/agent-wallets.sqlite";
import type { Deps } from "../use-cases/context";
import { assertOrb, chainMarket, confirmed, userWallet } from "./runtime";

export async function chainAgentWallet(deps: Deps, user: User) {
  const { ports } = deps;
  const { custody, reader, executor } = chainMarket(ports);
  const parent = await userWallet(ports, user);
  await assertOrb(ports, parent.address);
  const wallet = await custody.createWallet({
    kind: "system",
    name: `market-agent:${user.humanId}`,
  });
  await ports.provisionWallet?.(wallet);
  const humanId = (
    await reader.read<bigint>({
      contract: "HumanRegistry",
      functionName: "humanIdOf",
      args: [parent.address],
    })
  ).value;
  if (humanId === 0n)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "The owner must be linked on chain first.",
    );
  const linked = (
    await reader.read<bigint>({
      contract: "HumanRegistry",
      functionName: "humanIdOf",
      args: [wallet.address],
    })
  ).value;
  if (linked && linked !== humanId)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Agent wallet belongs to a different on-chain human.",
    );
  if (!linked) {
    if (!ports.chainAttester)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Chain attester is unavailable.",
      );
    const operationId = `agent-link:${reader.fingerprint}:${wallet.walletId}:${humanId}`;
    const saved = ports.db
      .query<{ command: string }, [string]>(
        "SELECT command FROM chain_operations WHERE id = ?",
      )
      .get(operationId);
    const deadline = (await reader.head()).timestamp + 3600n;
    const attestation = {
      kind: "link" as const,
      humanId,
      wallet: wallet.address,
      deadline,
    };
    const command = saved
      ? deserialize<
          Extract<
            import("../../../ports/chain-executor/chain-executor").ChainCommand,
            { kind: "link" | "relink" }
          >
        >(saved.command)
      : {
          ...attestation,
          signature: await ports.chainAttester.sign(attestation),
        };
    confirmed(
      await executor.execute({
        operationId,
        walletId: parent.walletId,
        command,
      }),
    );
  }
  agentWallets(ports.db).get(user);
  ports.db
    .query("INSERT OR IGNORE INTO wallet_balances VALUES (?, 0)")
    .run(wallet.address);
  ports.db
    .query("UPDATE market_agent_wallets SET address = ? WHERE human_id = ?")
    .run(wallet.address, user.humanId);
  return wallet;
}
export async function chainAgentTransfer(
  deps: Deps,
  user: User,
  amount: bigint,
  withdraw: boolean,
) {
  const { ports } = deps;
  const { executor, reader } = chainMarket(ports);
  const agent = await chainAgentWallet(deps, user);
  const parent = await userWallet(ports, user);
  const wallet = withdraw ? agent : parent;
  const to: Address = withdraw ? parent.address : agent.address;
  const request = serialize({ kind: "transfer", to, amount });
  let row = ports.db
    .query<{ id: string; request: string }, [string, string]>(
      "SELECT id,request FROM market_chain_intents WHERE fingerprint = ? AND wallet_id = ? AND state = 'pending'",
    )
    .get(reader.fingerprint, wallet.walletId);
  if (row && row.request !== request)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Another wallet operation is pending reconciliation.",
    );
  if (!row) {
    row = { id: ports.ids.next("agent-transfer"), request };
    ports.db
      .query(
        "INSERT INTO market_chain_intents (id,fingerprint,wallet_id,human_id,night_key,command,request) VALUES (?, ?, ?, ?, '', ?, ?)",
      )
      .run(
        row.id,
        reader.fingerprint,
        wallet.walletId,
        user.humanId,
        request,
        request,
      );
  }
  const result = await executor.execute({
    operationId: row.id,
    walletId: wallet.walletId,
    command: { kind: "transfer", to, amount },
  });
  if (result.state === "reverted")
    ports.db
      .query("UPDATE market_chain_intents SET state = 'reverted' WHERE id = ?")
      .run(row.id);
  confirmed(result);
  ports.db
    .query("UPDATE market_chain_intents SET state = 'finalized' WHERE id = ?")
    .run(row.id);
}
