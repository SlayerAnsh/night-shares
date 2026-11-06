import { isIP } from "node:net";

function parseIp(address: string) {
  const family = isIP(address);
  if (!family || address.includes("%")) return undefined;
  if (family === 4) {
    return {
      bits: 32,
      value: address
        .split(".")
        .reduce((value, octet) => (value << 8n) | BigInt(octet), 0n),
    };
  }
  let expanded = address;
  if (address.includes(".")) {
    const colon = address.lastIndexOf(":");
    const ipv4 = parseIp(address.slice(colon + 1));
    if (!ipv4) return undefined;
    expanded = `${address.slice(0, colon)}:${(ipv4.value >> 16n).toString(16)}:${(ipv4.value & 65535n).toString(16)}`;
  }
  const [left = "", right] = expanded.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const words =
    right === undefined
      ? start
      : [
          ...start,
          ...Array<string>(8 - start.length - end.length).fill("0"),
          ...end,
        ];
  return {
    bits: 128,
    value: words.reduce(
      (value, word) => (value << 16n) | BigInt(`0x${word}`),
      0n,
    ),
  };
}

function unmap(ip: { bits: number; value: bigint }) {
  return ip.bits === 128 && ip.value >> 32n === 65535n
    ? { bits: 32, value: ip.value & 0xffffffffn }
    : ip;
}

export function parseProxyRange(range: string) {
  const [address = "", prefix, extra] = range.split("/");
  const ip = parseIp(address);
  if (
    !ip ||
    extra !== undefined ||
    (prefix !== undefined && !/^\d+$/.test(prefix))
  )
    return undefined;
  let bits = prefix === undefined ? ip.bits : Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > ip.bits) return undefined;
  const normalized = unmap(ip);
  if (normalized.bits !== ip.bits) {
    if (bits < 96) return undefined;
    bits -= 96;
  }
  return { ...normalized, prefix: bits };
}

export function isTrustedProxy(address: string, ranges: readonly string[]) {
  const parsed = parseIp(address);
  if (!parsed) return false;
  const ip = unmap(parsed);
  return ranges.some((range) => {
    const network = parseProxyRange(range);
    if (!network || network.bits !== ip.bits) return false;
    const shift = BigInt(ip.bits - network.prefix);
    return ip.value >> shift === network.value >> shift;
  });
}

export function normalizeIpKey(
  address: string,
  ipv6Prefix: 48 | 64 = 64,
): string {
  const parsed = parseIp(address);
  if (!parsed) return address;
  const ip = unmap(parsed);
  if (ip.bits === 32) {
    return [24n, 16n, 8n, 0n]
      .map((shift) => Number((ip.value >> shift) & 255n))
      .join(".");
  }
  return `${[112n, 96n, 80n, 64n]
    .slice(0, ipv6Prefix / 16)
    .map((shift) => ((ip.value >> shift) & 65535n).toString(16))
    .join(":")}::/${ipv6Prefix}`;
}
