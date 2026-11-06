export interface Onramp {
  chargeCard(input: {
    amount: bigint;
    address: string;
  }): Promise<{ chargeId: string }>;
}
