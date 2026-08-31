import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { AddWalletForm } from "./AddWalletForm";
import { WalletList } from "./WalletList";
import { Button } from "@/components/ui/button";

export function Dashboard({ email }: { email: string }) {
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Monitored wallets</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{email}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>

      <AddWalletForm />
      <WalletList />
    </div>
  );
}
