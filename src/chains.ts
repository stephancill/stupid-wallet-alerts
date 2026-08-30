export interface ChainOption {
  id: number;
  name: string;
}

/** Curated chains offered in the UI (mirrors the ones the webhook provider resolves). */
export const CHAINS: ChainOption[] = [
  { id: 1, name: "Ethereum" },
  { id: 42161, name: "Arbitrum" },
  { id: 8453, name: "Base" },
  { id: 10, name: "Optimism" },
  { id: 137, name: "Polygon" },
  { id: 100, name: "Gnosis" },
];

export function chainName(chainId: number): string {
  return CHAINS.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`;
}
