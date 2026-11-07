import { expect, test } from "bun:test";
import { transactionExplorerUrl } from "./arc-networks";

test("transaction explorer follows the network, with no fork link", () => {
  const hash = `0x${"ab".repeat(32)}`;
  expect(transactionExplorerUrl(hash, "mainnet")).toBe(
    `https://explorer.arc.io/tx/${hash}`,
  );
  expect(transactionExplorerUrl(hash, "testnet")).toBe(
    `https://explorer.testnet.arc.io/tx/${hash}`,
  );
  expect(transactionExplorerUrl(hash, "fork")).toBe("");
  expect(transactionExplorerUrl("", "mainnet")).toBe("");
});
