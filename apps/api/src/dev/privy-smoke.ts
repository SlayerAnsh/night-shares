import { randomUUID } from "node:crypto";
import { parseTransaction } from "viem";
import { createPrivyWalletCustody } from "../ports/wallet-custody/wallet-custody.privy";

// This manual script creates a wallet and signs only. It never contacts a chain RPC.
if (process.env.ARC_NETWORK !== "testnet")
  throw new Error("privy-smoke requires ARC_NETWORK=testnet.");
const custody = createPrivyWalletCustody({
  appId: process.env.PRIVY_APP_ID ?? "",
  appSecret: process.env.PRIVY_APP_SECRET ?? "",
  authorizationKey: process.env.PRIVY_AUTHORIZATION_KEY,
});
const wallet = await custody.createWallet({
  kind: "system",
  name: `privy-smoke-${randomUUID()}`,
});
const signed = await custody.signTransaction(wallet.walletId, {
  chainId: 5042002,
  type: "eip1559",
  nonce: 0,
  to: wallet.address,
  data: "0x",
  value: 0n,
  gas: 21000n,
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 0n,
});
const transaction = parseTransaction(signed);
if (
  transaction.chainId !== 5042002 ||
  transaction.to?.toLowerCase() !== wallet.address.toLowerCase() ||
  (transaction.value ?? 0n) !== 0n
)
  throw new Error("Unexpected signed smoke transaction.");
console.log(
  JSON.stringify({
    walletId: wallet.walletId,
    address: wallet.address,
    signed: true,
    broadcast: false,
  }),
);
