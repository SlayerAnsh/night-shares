import { expect, test } from "bun:test";
import { clientIp } from "./client-ip";

test("untrusted sockets cannot choose their quota key through XFF", () => {
  expect(
    clientIp("203.0.113.8", "192.0.2.1, 10.0.0.1", true, 1, ["10.0.0.0/8"]),
  ).toBe("203.0.113.8");
  expect(clientIp("127.0.0.1", "192.0.2.1", true)).toBe("127.0.0.1");
  expect(clientIp("10.0.0.1", "192.0.2.1", true)).toBe("10.0.0.1");
  expect(clientIp("127.0.0.1", "192.0.2.1", false, 1, ["127.0.0.1"])).toBe(
    "127.0.0.1",
  );
});

test("trusted proxies select the configured hop from the right", () => {
  const header = "192.0.2.99, 203.0.113.7, 10.0.0.2";
  expect(clientIp("10.0.0.1", header, true, 1, ["10.0.0.0/24"])).toBe(
    "10.0.0.2",
  );
  expect(clientIp("10.0.0.1", header, true, 2, ["10.0.0.1"])).toBe(
    "203.0.113.7",
  );
  expect(clientIp("::ffff:10.0.0.1", header, true, 2, ["10.0.0.0/24"])).toBe(
    "203.0.113.7",
  );
  expect(clientIp("2001:db8::1", header, true, 2, ["2001:db8::/64"])).toBe(
    "203.0.113.7",
  );
  expect(clientIp("2001:db8:1::1", header, true, 2, ["2001:db8::/64"])).toBe(
    "2001:db8:1::1",
  );
  expect(
    clientIp("10.0.0.1", ["192.0.2.99", "203.0.113.7, 10.0.0.2"], true, 2, [
      "10.0.0.1",
    ]),
  ).toBe("203.0.113.7");
});

test("invalid or short headers fall back to the socket address", () => {
  for (const header of [
    undefined,
    "",
    "invalid, 192.0.2.1",
    "192.0.2.1,",
    "192.0.2.1",
    "[::1], 192.0.2.1",
    "fe80::1%eth0, 192.0.2.1",
  ]) {
    expect(clientIp("127.0.0.1", header, true, 2, ["127.0.0.1"])).toBe(
      "127.0.0.1",
    );
  }
  expect(clientIp(undefined, "192.0.2.1", true, 1, ["0.0.0.0/0"])).toBe(
    "unknown",
  );
});
