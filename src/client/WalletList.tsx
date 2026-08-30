import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Wallet } from "../api";
import { CHAINS, chainName } from "../chains";

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
    <ul>
      {wallets.map((w) => (
        <li key={w.address}>
          <WalletRow wallet={w} onChanged={invalidate} />
        </li>
      ))}
    </ul>
  );
}

function WalletRow({ wallet, onChanged }: { wallet: Wallet; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteWallet(wallet.address),
    onSuccess: onChanged,
  });

  return (
    <div>
      <div>
        <span>{wallet.label ?? "(no label)"}</span>
        {"  "}
        <span>{wallet.address}</span>
        {"  •  "}
        <span>active chains ({wallet.chains.length})</span>
        {"  •  "}
        <button type="button" onClick={() => setEditing((v) => !v)}>
          {editing ? "cancel" : "edit"}
        </button>{" "}
        <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending}>
          delete
        </button>
      </div>
      {editing && <EditForm wallet={wallet} onSaved={onChanged} />}
    </div>
  );
}

function EditForm({ wallet, onSaved }: { wallet: Wallet; onSaved: () => void }) {
  const [label, setLabel] = useState(wallet.label ?? "");
  const [chainIds, setChainIds] = useState(wallet.chains.map((c) => c.chainId));

  const save = useMutation({
    mutationFn: () =>
      api.updateWallet(wallet.address, {
        label: label.trim().length ? label.trim() : null,
        chainIds,
      }),
    onSuccess: onSaved,
  });

  const toggle = (id: number) => {
    setChainIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <div>
        <span>Active chains:</span>
        <ul>
          {CHAINS.map((c) => (
            <li key={c.id}>
              <label>
                <input
                  type="checkbox"
                  checked={chainIds.includes(c.id)}
                  onChange={() => toggle(c.id)}
                />
                {chainName(c.id)}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
