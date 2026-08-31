import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api";
import { CHAINS } from "../chains";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      toast.success("Wallet added.");
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (err) => {
      toast.error(`Could not add wallet: ${err.message}`);
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
    <Card>
      <CardHeader>
        <CardTitle>Watch a wallet</CardTitle>
        <CardDescription>
          Choose a wallet address and the chains to monitor for activity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected.size === 0) return;
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Wallet address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="font-mono"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. main wallet"
              />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Chains to watch</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CHAINS.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm has-[[data-state=checked]]:border-primary"
                >
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" disabled={mutation.isPending || selected.size === 0}>
            {mutation.isPending ? "Adding…" : "Watch this wallet"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
