import { encodeAbiParameters, type Hex, keccak256, stringToHex } from "viem";

const parameters = [
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "uint256" },
  { type: "uint64" },
  { type: "bytes32" },
] as const;
const buyType = keccak256(
  stringToHex(
    "X402Buy(bytes32 night,uint256 qty,uint64 deadline,bytes32 salt)",
  ),
);
const sellType = keccak256(
  stringToHex(
    "X402Sell(bytes32 night,uint256 minReceived,uint64 deadline,bytes32 salt)",
  ),
);
export function x402BuyNonce(
  night: Hex,
  qty: bigint,
  deadline: bigint,
  salt: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(parameters, [buyType, night, qty, deadline, salt]),
  );
}
export function x402SellNonce(
  night: Hex,
  minReceived: bigint,
  deadline: bigint,
  salt: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(parameters, [
      sellType,
      night,
      minReceived,
      deadline,
      salt,
    ]),
  );
}
