import { expect, test } from "bun:test";
import { keccak256, stringToHex } from "viem";
import { defaultDomain, orderTypedData } from "./typed-data";

// Pins the encoding agreed with the contracts package (SPECS.md, signed orders).
test("orders encode token base units, uint64 seconds and the night key hash", () => {
  const { typedDataJson } = orderTypedData(
    {
      night: "ubud:suite:2026-12-20",
      size: 5,
      price: 1_352_670_000n,
      expiry: 1_798_000_000_999,
      nonce: 3n,
      maker: "0x00000000000000000000000000000000000000aa",
    },
    defaultDomain,
  );
  const data = JSON.parse(typedDataJson);
  expect(data.types.Order).toEqual([
    { name: "night", type: "bytes32" },
    { name: "size", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "maker", type: "address" },
  ]);
  expect(data.domain).toMatchObject({ name: "NightShares", version: "1" });
  expect(data.message).toMatchObject({
    night: keccak256(stringToHex("ubud:suite:2026-12-20")),
    size: "500000000000000000",
    price: "1352670000",
    expiry: "1798000000",
    nonce: "3",
  });
});
