import type { Address, Hex } from "viem";
import { DomainError } from "../../shared/errors/domain-error";

export type Network = `eip155:${number}`;
// The wire representation intentionally uses decimal strings, including timestamps.
export type PaymentPayload = {
  x402Version: 1;
  scheme: "exact";
  network: Network;
  payload: {
    signature: Hex;
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    };
  };
};
export type X402Terms = {
  side: "buy" | "sell";
  night: Hex;
  qty: string;
  minReceived?: string;
  deadline: string;
  salt: Hex;
};
export type PaymentRequirements = {
  scheme: "exact";
  network: Network;
  maxAmountRequired: string;
  asset: Address;
  payTo: Address;
  resource: string;
  description: string;
  mimeType: "application/json";
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; terms: X402Terms };
};
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64");
export function encodePaymentHeader(payment: PaymentPayload): string {
  const header = encode(payment);
  decodePaymentHeader(header);
  return header;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error();
  return value as Record<string, unknown>;
}
const matches = (value: unknown, pattern: RegExp) =>
  typeof value === "string" && pattern.test(value);
export function decodePaymentHeader(header: string): PaymentPayload {
  try {
    if (
      header.length > 16384 ||
      !matches(
        header,
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      )
    )
      throw new Error();
    const payment = object(
      JSON.parse(Buffer.from(header, "base64").toString("utf8")),
    );
    const payload = object(payment.payload);
    const auth = object(payload.authorization);
    if (
      payment.x402Version !== 1 ||
      payment.scheme !== "exact" ||
      !matches(payment.network, /^eip155:[1-9][0-9]*$/) ||
      !matches(payload.signature, /^0x(?:[0-9a-fA-F]{2})+$/)
    )
      throw new Error();
    for (const key of ["from", "to"])
      if (!matches(auth[key], /^0x[0-9a-fA-F]{40}$/)) throw new Error();
    if (!matches(auth.nonce, /^0x[0-9a-fA-F]{64}$/)) throw new Error();
    for (const key of ["value", "validAfter", "validBefore"]) {
      if (
        !matches(auth[key], /^(0|[1-9][0-9]*)$/) ||
        BigInt(auth[key] as string) >= 2n ** 256n
      )
        throw new Error();
    }
    return payment as PaymentPayload;
  } catch {
    throw new DomainError("INVALID_ARGUMENT", "Invalid payment header");
  }
}
export function encodePaymentResponse(response: {
  success: boolean;
  transaction?: Hex;
  network: Network;
  payer: Address;
}): string {
  return encode(response);
}
