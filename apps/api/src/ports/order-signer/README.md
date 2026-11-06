# Order signer

The mock signs an EIP-712 digest with HMAC-SHA256 using `ORDER_MOCK_SECRET` (development default `night-shares-dev-order-secret`). The message is `${maker}|${digest}` and the signature is `mock:` followed by lowercase hex. Verification recomputes the signature. Both operations are synchronous and local.

The Privy adapter signs the unchanged typed data through wallet custody. Its synchronous verifier hashes typed data with viem, recovers the secp256k1 public key with @noble/curves, and compares the viem-derived address with the maker. Custodial signers are registered per container. The PostAsk RPC awaits signing outside SQLite, then verifies and rechecks nonce and expiry inside its insertion transaction. The synchronous mock helper remains available for existing unit callers.
