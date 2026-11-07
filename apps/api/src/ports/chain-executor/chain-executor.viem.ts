import type { Database } from "bun:sqlite";
import { chmodSync, existsSync } from "node:fs";
import {
  type Address,
  type Hex,
  keccak256,
  type TransactionReceipt,
} from "viem";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import { digest, type ForkClient } from "../arc-deployment/validate";
import type { ChainReader } from "../chain-reader/chain-reader";
import type {
  TransactionEnvelope,
  WalletCustody,
} from "../wallet-custody/wallet-custody";
import {
  type ChainExecutor,
  deserialize,
  type ExecutionRequest,
  type ExecutionResult,
  type OperationState,
  serialize,
} from "./chain-executor";
import { calldata, commandCall } from "./codecs";

type Row = {
  id: string;
  fingerprint: string;
  payload_hash: string;
  command: string;
  wallet_id: string;
  sender: Address;
  state: OperationState;
  nonce: number | bigint | null;
  calldata: Hex;
  destination: Address;
  envelope: string | null;
  signed_payload: Hex | null;
  tx_hash: Hex | null;
  receipt: string | null;
};
export function createChainExecutor(deps: {
  db: Database;
  deployment: ArcDeployment;
  client: ForkClient;
  reader: ChainReader;
  custody: WalletCustody;
  gasHeadroomBps?: number;
  afterBroadcast?: () => void;
}): ChainExecutor {
  const { db, deployment: d, client, reader, custody } = deps;
  if (db.filename && db.filename !== ":memory:") {
    for (const path of [
      db.filename,
      `${db.filename}-wal`,
      `${db.filename}-shm`,
    ])
      if (existsSync(path)) chmodSync(path, 0o600);
  }
  const headroom = deps.gasHeadroomBps ?? 12000;
  if (!Number.isInteger(headroom) || headroom < 10000 || headroom > 50000)
    throw new Error("Gas headroom must be 10000..50000 bps.");
  if (!custody.signTransaction || !custody.resolveWallet)
    throw new Error("Execution requires transaction-compatible custody.");
  const row = (id: string) =>
    db
      .query<Row, [string]>("SELECT * FROM chain_operations WHERE id = ?")
      .get(id);
  const result = (r: Row): ExecutionResult => ({
    operationId: r.id,
    fingerprint: r.fingerprint,
    state: r.state,
    hash: r.tx_hash ?? undefined,
    receipt: r.receipt ? deserialize<TransactionReceipt>(r.receipt) : undefined,
  });
  async function deliver(r: Row): Promise<ExecutionResult> {
    if (r.fingerprint !== reader.fingerprint)
      throw new Error("Stale deployment operation rejected.");
    await reader.assertCurrent();
    if (!r.tx_hash || !r.signed_payload)
      throw new Error("Operation must be signed before delivery.");
    let receipt: TransactionReceipt | undefined;
    try {
      receipt = await client.getTransactionReceipt({ hash: r.tx_hash });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "TransactionReceiptNotFoundError"
      )
        throw error;
    }
    if (!receipt) {
      const nonce = await client.getTransactionCount({
        address: r.sender,
        blockTag: "latest",
      });
      if (nonce > Number(r.nonce)) {
        db.query(
          "UPDATE chain_operations SET state = 'needs_reconciliation' WHERE id = ?",
        ).run(r.id);
        throw new Error(
          "Sender nonce consumed without known receipt; reconciliation required.",
        );
      }
      try {
        await client.sendRawTransaction({
          serializedTransaction: r.signed_payload,
        });
        deps.afterBroadcast?.();
        db.query(
          "UPDATE chain_operations SET state = 'submitted' WHERE id = ?",
        ).run(r.id);
        receipt = await client.waitForTransactionReceipt({
          hash: r.tx_hash,
          timeout: 15000,
        });
      } catch {
        // Delivery may have succeeded. Never allocate another nonce or compensate here.
        db.query(
          "UPDATE chain_operations SET state = 'needs_reconciliation' WHERE id = ?",
        ).run(r.id);
        return result(row(r.id) as Row);
      }
    }
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash)
      throw new Error("Noncanonical receipt; reconciliation required.");
    db.query(
      "UPDATE chain_operations SET state = ?, receipt = ?, block_number = ?, block_hash = ? WHERE id = ?",
    ).run(
      receipt.status === "success" ? "mined" : "reverted",
      serialize(receipt),
      receipt.blockNumber,
      receipt.blockHash,
      r.id,
    );
    if (receipt.status === "success") {
      await reader.ingest(receipt);
      db.query(
        "UPDATE chain_operations SET state = 'finalized' WHERE id = ?",
      ).run(r.id);
    }
    return result(row(r.id) as Row);
  }
  const executor: ChainExecutor = {
    mode: "fork",
    pending: () =>
      db
        .query<{ id: string }, [string]>(
          "SELECT id FROM chain_operations WHERE fingerprint = ? AND state NOT IN ('finalized','reverted') ORDER BY nonce",
        )
        .all(reader.fingerprint)
        .map((r) => r.id),
    async recover(id) {
      const r = row(id);
      if (!r) throw new Error("Unknown chain operation.");
      if (r.fingerprint !== reader.fingerprint)
        throw new Error("Stale deployment operation rejected.");
      if (!r.signed_payload)
        return executor.execute({
          operationId: id,
          walletId: r.wallet_id,
          command: deserialize(r.command),
        });
      return deliver(r);
    },
    async execute(request: ExecutionRequest) {
      if (db.inTransaction)
        throw new Error(
          "Chain execution cannot run inside a SQLite transaction.",
        );
      if (!request.operationId.trim())
        throw new Error("Operation ID is required.");
      const payloadHash = digest({
        walletId: request.walletId,
        command: request.command,
      });
      let existing = row(request.operationId);
      if (existing) {
        if (existing.fingerprint !== reader.fingerprint)
          throw new Error("Stale deployment operation rejected.");
        if (existing.payload_hash !== payloadHash)
          throw new Error("Operation ID payload mismatch.");
        if (existing.signed_payload) return deliver(existing);
      }
      await reader.assertCurrent();
      const wallet = await custody.resolveWallet?.(request.walletId);
      if (!wallet) throw new Error("Unknown execution wallet.");
      if (
        request.command.kind === "verifyHuman" &&
        wallet.address.toLowerCase() !== d.ATTESTER.toLowerCase()
      )
        throw new Error("verifyHuman requires the attester sender.");
      const call = await commandCall(d, request.command, (night) =>
        reader.tokenOf(night),
      );
      const data = calldata(call);
      await client.simulateContract({ ...call, account: wallet.address });
      const gas =
        ((await client.estimateGas({
          account: wallet.address,
          to: call.address,
          data,
        })) *
          BigInt(headroom)) /
        10000n;
      const fees = await client.estimateFeesPerGas();
      if (
        (await client.getBalance({ address: wallet.address })) <
        gas * fees.maxFeePerGas
      )
        throw new Error("Insufficient native USDC gas balance (18 decimals).");
      const pendingNonce = await client.getTransactionCount({
        address: wallet.address,
        blockTag: "pending",
      });
      existing = db
        .transaction(() => {
          const current = row(request.operationId);
          if (current) {
            if (
              current.payload_hash !== payloadHash ||
              current.fingerprint !== reader.fingerprint
            )
              throw new Error("Operation ID payload mismatch.");
            return current;
          }
          const max = db
            .query<{ nonce: bigint | null }, [string, string]>(
              "SELECT MAX(nonce) AS nonce FROM chain_operations WHERE fingerprint = ? AND sender = ?",
            )
            .get(reader.fingerprint, wallet.address.toLowerCase());
          const nonce = Math.max(
            pendingNonce,
            max?.nonce === null || max?.nonce === undefined
              ? 0
              : Number(max.nonce) + 1,
          );
          const envelope: TransactionEnvelope = {
            chainId: 5042,
            type: "eip1559",
            nonce,
            to: call.address,
            data,
            value: 0n,
            gas,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          };
          db.query(
            "INSERT INTO chain_operations (id,fingerprint,payload_hash,command,wallet_id,sender,state,nonce,calldata,destination,envelope) VALUES (?, ?, ?, ?, ?, ?, 'prepared', ?, ?, ?, ?)",
          ).run(
            request.operationId,
            reader.fingerprint,
            payloadHash,
            serialize(request.command),
            request.walletId,
            wallet.address.toLowerCase(),
            nonce,
            data,
            call.address,
            serialize(envelope),
          );
          return row(request.operationId) as Row;
        })
        .immediate();
      if (existing.signed_payload) return deliver(existing);
      const signed = await custody.signTransaction?.(
        request.walletId,
        deserialize<TransactionEnvelope>(existing.envelope as string),
      );
      if (!signed) throw new Error("Custody did not sign transaction.");
      db.query(
        "UPDATE chain_operations SET signed_payload = ?, tx_hash = ?, state = 'signed' WHERE id = ? AND signed_payload IS NULL",
      ).run(signed, keccak256(signed), existing.id);
      return deliver(row(existing.id) as Row);
    },
  };
  return executor;
}
