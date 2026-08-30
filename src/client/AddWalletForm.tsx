import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const CURATED_CHAINS: { id: number; name: string }[] = [
  { id: 1, name: "Ethereum" },
  { id: 42161, name: "Arbitrum" },
  { id: 8453, name: "Base" },
  { id: 10, name: "Optimism" },
  { id: 137, name: "Polygon" },
  { id: 100, name: "Gnosis" },
];

export function AddWalletForm() {
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set([1, 8453, 42161]));

  const mutation = useMutation({
    mutationFn: () =>
      api.addWallet({
        address,
        label: label.trim() || undefined,
        chainIds: [...selected],
      }),
    onSuccess: () => {
      setAddress("");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.size === 0) return;
        mutation.mutate();
      }}
    >
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        <label className="col-span-full block">
          Wallet address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            className="mt-1 block w-full border p-2"
          />
        </label>
        <label className="col-span-full block">
          Label (optional)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. main wallet"
            className="mt-1 block w-full border p-2"
          />
        </label>
      </div>

      <fieldset className="max-w-xl">
        <legend>Chains to watch</legend>
        <div className="flex max-w-xl flex-wrap gap-4">
          {CURATED_CHAINS.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      {mutation.isError && <p role="alert">Could not add wallet: {mutation.error?.message}</p>}
      {mutation.isSuccess && <p>Wallet added.</p>}

      <button type="submit" disabled={mutation.isPending || selected.size === 0}>
        {mutation.isPending ? "Adding…" : "Watch this wallet"}
      </button>
    </form>
  );
}
