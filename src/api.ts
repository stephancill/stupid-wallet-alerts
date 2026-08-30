export interface ChainState {
  chainId: number;
  status: string;
  externalSubscriptionId: string | null;
  activeFromBlock: string | null;
  message: string | null;
}

export interface Wallet {
  address: string;
  label: string | null;
  chain_ids: number[];
  created_at: string;
  chains: ChainState[];
}

export interface SessionUser {
  id: string;
  email: string;
}

interface ApiError extends Error {
  status: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail) as ApiError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  getSession: () => request<{ user: SessionUser | null }>("/api/auth/session"),
  requestSignIn: (email: string) =>
    request<{ ok: boolean }>("/api/auth/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  listWallets: () => request<{ wallets: Wallet[] }>("/api/wallets"),
  addWallet: (input: { address: string; label?: string; chainIds: number[] }) =>
    request<{ wallet: Wallet }>("/api/wallets", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteWallet: (address: string) =>
    request<{ ok: boolean }>(`/api/wallets/${encodeURIComponent(address)}`, {
      method: "DELETE",
    }),
  updateWalletLabel: (address: string, label: string) =>
    request<{ ok: boolean; label: string | null }>(`/api/wallets/${encodeURIComponent(address)}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    }),
  listChains: () => request<{ chains: { chainId: number; name: string }[] }>("/api/chains"),
};
