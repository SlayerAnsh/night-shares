export interface OrderSigner {
  verify(
    maker: string,
    digest: string,
    signature: string,
    typedDataJson?: string,
  ): boolean;
  signCustodial(maker: string, digest: string, typedDataJson?: string): string;
}

export interface AsyncOrderSigner {
  verify(
    maker: string,
    digest: string,
    signature: string,
    typedDataJson: string,
  ): boolean;
  signCustodial(
    maker: string,
    digest: string,
    typedDataJson: string,
  ): Promise<string>;
}

const custodialSigners = new WeakMap<object, AsyncOrderSigner>();

export function configureCustodialSigner(
  owner: object,
  signer: AsyncOrderSigner,
) {
  custodialSigners.set(owner, signer);
}

export function custodialSigner(owner: object) {
  return custodialSigners.get(owner);
}
