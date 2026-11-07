import { parseAbi, parseSignature } from "viem";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import type { X402Command } from "./chain-executor";
import type { ContractCall } from "./codecs";

export const authorizationAbi = parseAbi([
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
  "function authorizationState(address authorizer,bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
]);

export function x402Call(d: ArcDeployment, c: X402Command): ContractCall {
  if (!d.x402Available || !d.X402Settler)
    throw new Error("x402 unavailable on this deployment.");
  if (c.kind === "authorizedTransfer") {
    const { r, s, v, yParity } = parseSignature(c.signature);
    const a = c.auth;
    return {
      address: c.token,
      abi: authorizationAbi,
      functionName: "transferWithAuthorization",
      args: [
        a.from,
        a.to,
        a.value,
        a.validAfter,
        a.validBefore,
        a.nonce,
        Number(v ?? BigInt(27 + (yParity ?? 0))),
        r,
        s,
      ],
    };
  }
  return {
    address: d.X402Settler,
    abi: d.abis.X402Settler ?? [],
    functionName: c.kind === "x402Buy" ? "buy" : "sell",
    args:
      c.kind === "x402Buy"
        ? [
            c.auth,
            c.signature,
            c.night,
            c.qty,
            c.asks,
            c.hints,
            c.deadline,
            c.salt,
          ]
        : [
            c.auth,
            c.signature,
            c.night,
            c.minReceived,
            c.hints,
            c.deadline,
            c.salt,
          ],
  };
}
