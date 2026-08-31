import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { api } from "./api";
import { SignIn } from "./client/SignIn";
import { Dashboard } from "./client/Dashboard";
import { Logo } from "./client/Logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function App() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
  const params = new URLSearchParams(window.location.search);
  const linkError = params.get("error") === "invalid-link";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center gap-3">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">stupid wallet alerts</span>
      </header>

      <main>
        {linkError && !session.data?.user && (
          <Alert variant="destructive" className="mb-4">
            <CircleAlertIcon />
            <AlertTitle>Invalid sign-in link</AlertTitle>
            <AlertDescription>
              This sign-in link is invalid or has expired — request a new one below.
            </AlertDescription>
          </Alert>
        )}
        {session.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : session.data?.user ? (
          <Dashboard email={session.data.user.email} />
        ) : (
          <SignIn />
        )}
      </main>

      <footer className="mt-12 text-sm text-muted-foreground">
        Signed activity alerts for your EVM wallets
      </footer>
    </div>
  );
}
