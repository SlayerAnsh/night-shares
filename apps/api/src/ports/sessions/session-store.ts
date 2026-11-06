export type User = {
  id: string;
  humanId: string;
  level: "device" | "orb";
  walletAddress: string;
};
export interface SessionStore {
  create(user: User): string;
  get(token: string): User | undefined;
  delete(token: string): void;
}
