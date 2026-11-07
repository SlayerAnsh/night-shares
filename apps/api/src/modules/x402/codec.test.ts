import { expect, test } from "bun:test";
import {
  decodePaymentHeader,
  encodePaymentHeader,
  encodePaymentResponse,
  type PaymentPayload,
} from "./codec";

const payment: PaymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "eip155:5042",
  payload: {
    signature: `0x${"ab".repeat(65)}`,
    authorization: {
      from: `0x${"11".repeat(20)}`,
      to: `0x${"22".repeat(20)}`,
      value: "9007199254740993000000",
      validAfter: "0",
      validBefore: "1800000000",
      nonce: `0x${"33".repeat(32)}`,
    },
  },
};
test("codec round trips a payment header", () => {
  const header = encodePaymentHeader(payment);
  expect(JSON.parse(Buffer.from(header, "base64").toString())).toEqual(payment);
  expect(decodePaymentHeader(header)).toEqual(payment);
});
test("codec rejects malformed headers and nondecimal authorization amounts", () => {
  for (const value of [
    "!",
    "e30=",
    Buffer.from(JSON.stringify({ ...payment, x402Version: 2 })).toString(
      "base64",
    ),
    Buffer.from(
      JSON.stringify({
        ...payment,
        payload: {
          ...payment.payload,
          authorization: { ...payment.payload.authorization, value: 12 },
        },
      }),
    ).toString("base64"),
  ]) {
    expect(() => decodePaymentHeader(value)).toThrow("Invalid payment header");
  }
});
test("codec encodes the payment response", () => {
  const response = {
    success: true,
    transaction: `0x${"44".repeat(32)}` as const,
    network: payment.network,
    payer: payment.payload.authorization.from,
  };
  expect(
    JSON.parse(
      Buffer.from(encodePaymentResponse(response), "base64").toString(),
    ),
  ).toEqual(response);
});
