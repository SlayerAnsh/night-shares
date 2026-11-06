import { createPrivateKey, createPublicKey, sign } from "node:crypto";

// Privy signs RFC 8785 JSON with a P-256 authorization key.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Invalid authorization payload.");
  return encoded;
}
export function privyAuthorization(encoded: string) {
  const key = createPrivateKey({
    key: Buffer.from(encoded.replace(/^wallet-auth:/, ""), "base64"),
    format: "der",
    type: "pkcs8",
  });
  if (key.asymmetricKeyDetails?.namedCurve !== "prime256v1")
    throw new Error("PRIVY_AUTHORIZATION_KEY must be a P-256 private key.");
  return {
    publicKey: createPublicKey(key)
      .export({ format: "der", type: "spki" })
      .toString("base64"),
    sign(url: string, body: unknown, headers: Record<string, string>) {
      return sign(
        "sha256",
        Buffer.from(
          canonical({ version: 1, method: "POST", url, body, headers }),
        ),
        key,
      ).toString("base64");
    },
  };
}
