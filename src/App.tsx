import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { SignIn } from "./client/SignIn";
import { Dashboard } from "./client/Dashboard";
import { Logo } from "./client/Logo";

export function App() {
  const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
  const params = new URLSearchParams(window.location.search);
  const linkError = params.get("error") === "invalid-link";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center gap-2">
        <Logo />
        <span className="text-lg font-semibold">stupid wallet alerts</span>
      </header>

      <main>
        {linkError && !session.data?.user && (
          <p role="alert" className="mb-4 border p-3">
            This sign-in link is invalid or has expired — request a new one below.
          </p>
        )}
        {session.isLoading ? (
          <p className="text-slate-500">Loading…</p>
        ) : session.data?.user ? (
          <Dashboard email={session.data.user.email} />
        ) : (
          <SignIn />
        )}
      </main>

      <footer className="mt-12 text-sm">Signed activity alerts for your EVM wallets</footer>
    </div>
  );
}
