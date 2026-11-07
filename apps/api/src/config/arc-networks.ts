import { envValue } from "./env";

const shared = {
  usdc: "0x3600000000000000000000000000000000000000",
  usdcDecimals: 6,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
} as const;
export const ARC_NETWORKS = {
  fork: {
    chainId: 5042,
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
    txExplorerBase: "",
    usdc: undefined,
  },
  mainnet: {
    ...shared,
    chainId: 5042,
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
    txExplorerBase: "https://explorer.arc.io/tx/",
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    positionManager: "0x6049c9a0e26405C0985f9E3685C87d0aE917f82B",
    universalRouter: "0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1",
    quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
    stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  },
  testnet: {
    ...shared,
    chainId: 5042002,
    rpcUrl: "https://rpc.testnet.arc.io",
    explorerUrl: "https://explorer.testnet.arc.io",
    txExplorerBase: "https://explorer.testnet.arc.io/tx/",
    poolManager: null,
    positionManager: null,
    universalRouter: null,
    quoter: null,
    stateView: null,
  },
} as const;

export function transactionExplorerUrl(
  hash: string,
  network = envValue("ARC_NETWORK") ?? "fork",
) {
  const base =
    ARC_NETWORKS[network as keyof typeof ARC_NETWORKS]?.txExplorerBase;
  return base && hash ? `${base}${hash}` : "";
}
