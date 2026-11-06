# Order signer

The mock signs an EIP-712 digest with HMAC-SHA256 using `ORDER_MOCK_SECRET` (development default `night-shares-dev-order-secret`). The message is `${maker}|${digest}` and the signature is `mock:` followed by lowercase hex. Verification recomputes the signature. Both operations are synchronous and local.

TODO: Implement a real adapter with viem `recoverTypedDataAddress` when chain integration is in scope.
