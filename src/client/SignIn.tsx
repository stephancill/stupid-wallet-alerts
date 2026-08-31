import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    onError: () => {
      setSent(false);
      toast.error("Couldn't send the sign-in link. Please try again.");
    },
  });

  if (sent) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent a sign-in link to <strong>{email}</strong>. Open it to get started. It expires
            in 30 minutes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Sign in with email</CardTitle>
        <CardDescription>
          Add wallet addresses to monitor and get emailed when they move.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <Button type="submit" disabled={submit.isPending} className="w-full">
            {submit.isPending ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
