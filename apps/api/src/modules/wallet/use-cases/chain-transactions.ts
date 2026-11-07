import type { Ports } from "../../../container/ports";
import { deserialize } from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import type { WalletTransaction } from "../../../ports/wallet-provider/wallet-provider";
import { chainMarket } from "../../market/chain/runtime";
export async function chainTransactions(
  ports: Ports,
  user: User,
): Promise<WalletTransaction[]> {
  const { reader, deployment } = chainMarket(ports);
  await reader.poll(1000);
  const rows = ports.db
    .query<
      {
        tx_hash: string;
        log_index: bigint;
        block_number: bigint;
        args: string;
      },
      [string, string]
    >(
      "SELECT * FROM chain_events WHERE fingerprint = ? AND lower(address) = lower(?) AND event = 'Transfer' ORDER BY block_number DESC,log_index DESC",
    )
    .all(reader.fingerprint, deployment.USDC);
  const result: WalletTransaction[] = [];
  for (const row of rows) {
    const a = deserialize<{ from: string; to: string; value: bigint }>(
      row.args,
    );
    const outgoing = a.from.toLowerCase() === user.walletAddress.toLowerCase();
    if (!outgoing && a.to.toLowerCase() !== user.walletAddress.toLowerCase())
      continue;
    const block = (
      await reader.cash(user.walletAddress as `0x${string}`, row.block_number)
    ).block;
    result.push({
      id: `${row.tx_hash}:${row.log_index}`,
      at: Number(block.timestamp) * 1000,
      from: a.from,
      to: a.to,
      amount: a.value,
      memo: outgoing
        ? "withdrawal:chain USDC transfer"
        : "deposit:chain USDC transfer",
      direction: outgoing ? "out" : "in",
    });
  }
  return result;
}
