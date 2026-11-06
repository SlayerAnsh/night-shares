import { type Address, hashTypedData, keccak256, stringToHex } from "viem";
export type Order = {
  night: string;
  size: number;
  price: bigint;
  expiry: number;
  nonce: bigint;
  maker: string;
};
/** Base units of NightToken per tenth of a room night. */
export const TOKENS_PER_TENTH = 10n ** 17n;
export type OrderDomain = { chainId: number; verifyingContract: Address };
export const defaultDomain: OrderDomain = {
  chainId: 5042002,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};
export function orderTypedData(order: Order, domain: OrderDomain) {
  const typedData = {
    domain: {
      name: "NightShares",
      version: "1",
      ...domain,
      chainId: BigInt(domain.chainId),
    },
    primaryType: "Order" as const,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Order: [
        { name: "night", type: "bytes32" },
        { name: "size", type: "uint256" },
        { name: "price", type: "uint256" },
        { name: "expiry", type: "uint64" },
        { name: "nonce", type: "uint256" },
        { name: "maker", type: "address" },
      ],
    } as const,
    message: {
      ...order,
      night: keccak256(stringToHex(order.night)),
      // NightToken has 18 decimals: one tenth of a room night is 1e17.
      size: BigInt(order.size) * TOKENS_PER_TENTH,
      expiry: BigInt(Math.floor(order.expiry / 1000)),
      maker: order.maker as Address,
    },
  };
  return {
    digest: hashTypedData(typedData),
    typedDataJson: JSON.stringify(typedData, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  };
}
