export interface OrderSigner {
  verify(maker: string, digest: string, signature: string): boolean;
  signCustodial(maker: string, digest: string): string;
}
