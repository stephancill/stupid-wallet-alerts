import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () => api.requestSignIn(email),
    onSuccess: () => {
      setSent(true);
      qc.invalidateQueries({ queryKey: ["session"] });
    },
    onError: () => setSent(false),
  });

  if (sent) {
    return (
      <section className="max-w-md space-y-2">
        <h1 className="text-xl">Check your inbox</h1>
        <p>
          We sent a sign-in link to <strong>{email}</strong>. Open it to get started. It expires in
          30 minutes.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-md space-y-4">
      <header>
        <h1 className="text-xl">Sign in with email</h1>
        <p>Add wallet addresses to monitor and get emailed when they move.</p>
      </header>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <label htmlFor="email" className="block">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="block w-full border p-2"
        />
        {submit.isError && <p role="alert">Something went wrong. Try again.</p>}
        <button type="submit" disabled={submit.isPending}>
          {submit.isPending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </section>
  );
}
