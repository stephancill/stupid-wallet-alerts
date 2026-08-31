import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Wallet } from "../api";
import { CHAINS, chainName } from "../chains";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function WalletList() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["wallets"],
    queryFn: api.listWallets,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wallets"] });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading wallets…</div>;
  if (isError)
    return <div className="text-sm text-destructive">Couldn't load wallets: {error?.message}</div>;

  const wallets = data?.wallets ?? [];
  if (wallets.length === 0) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          No wallets yet — add one above to start receiving activity emails.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {wallets.map((w) => (
        <WalletRow key={w.address} wallet={w} onChanged={invalidate} />
      ))}
    </div>
  );
}

function statusVariant(status: string): "default" | "outline" | "secondary" {
  if (status === "active") return "default";
  if (status === "unsupported") return "secondary";
  return "outline";
}

function WalletRow({ wallet, onChanged }: { wallet: Wallet; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteWallet(wallet.address),
    onSuccess: () => {
      toast.success("Wallet removed.");
      onChanged();
    },
    onError: (err) => toast.error(`Could not remove wallet: ${err.message}`),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>{wallet.label ?? wallet.address}</CardTitle>
          {wallet.label && (
            <div className="font-mono text-sm text-muted-foreground">{wallet.address}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Delete"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {wallet.chains.map((c) => (
            <Badge key={c.chainId} variant={statusVariant(c.status)}>
              {chainName(c.chainId)}
            </Badge>
          ))}
        </div>
        {editing && <EditForm wallet={wallet} onSaved={onChanged} />}
      </CardContent>
    </Card>
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
    onSuccess: () => {
      toast.success("Wallet updated.");
      onSaved();
    },
    onError: (err) => toast.error(`Could not update wallet: ${err.message}`),
  });

  const toggle = (id: number) => {
    setChainIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Options that aren't already selected, plus a placeholder for adding.
  const available = CHAINS.filter((c) => !chainIds.includes(c.id));

  return (
    <form
      className="space-y-4 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`edit-label-${wallet.address}`}>Label</Label>
        <Input
          id={`edit-label-${wallet.address}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. main wallet"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chainIds.map((id) => (
          <Badge key={id} variant="secondary">
            {chainName(id)}
            <button type="button" aria-label={`Remove ${chainName(id)}`} onClick={() => toggle(id)}>
              <span className="ml-0.5">✕</span>
            </button>
          </Badge>
        ))}
        {available.length > 0 && (
          <Select
            value=""
            onValueChange={(v) => {
              if (v) toggle(Number(v));
            }}
          >
            <SelectTrigger size="sm" className="w-fit gap-1.5">
              <SelectValue placeholder="Add chain…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
