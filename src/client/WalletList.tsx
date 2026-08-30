import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Wallet } from "../api";

export function WalletList() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["wallets"],
    queryFn: api.listWallets,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wallets"] });

  if (isLoading) return <p>Loading wallets…</p>;
  if (isError) return <p role="alert">Couldn't load wallets: {error?.message}</p>;

  const wallets = data?.wallets ?? [];
  if (wallets.length === 0) {
    return <p>No wallets yet — add one above to start receiving activity emails.</p>;
  }

  return (
    <ul className="space-y-3">
      {wallets.map((w) => (
        <li key={w.address} className="max-w-xl border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-mono">{w.address}</p>
            </div>
            <RemoveButton address={w.address} onRemoved={invalidate} />
          </div>
          <LabelEditor wallet={w} onSaved={invalidate} />
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {w.chains.map((chain) => (
              <li key={chain.chainId}>
                chain {chain.chainId} · {chain.status}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function RemoveButton({ address, onRemoved }: { address: string; onRemoved: () => void }) {
  const remove = useMutation({
    mutationFn: () => api.deleteWallet(address),
    onSuccess: onRemoved,
  });
  return (
    <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending}>
      Remove
    </button>
  );
}

function LabelEditor({ wallet, onSaved }: { wallet: Wallet; onSaved: () => void }) {
  const [label, setLabel] = useState(wallet.label ?? "");
  const save = useMutation({
    mutationFn: () => api.updateWalletLabel(wallet.address, label.trim()),
    onSuccess: onSaved,
  });

  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor={`label-${wallet.address}`} className="sr-only">
        Label
      </label>
      <input
        id={`label-${wallet.address}`}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label"
        className="min-w-0 flex-1 border p-1"
      />
      <button type="submit" disabled={save.isPending}>
        Save
      </button>
    </form>
  );
}
