import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { AddWalletForm } from "./AddWalletForm";
import { WalletList } from "./WalletList";

export function Dashboard({ email }: { email: string }) {
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl">Monitored wallets</h1>
        <div className="flex items-center gap-3">
          <span>{email}</span>
          <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Sign out
          </button>
        </div>
      </div>

      <AddWalletForm />
      <WalletList />
    </div>
  );
}
