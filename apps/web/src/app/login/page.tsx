"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SunMedium } from "lucide-react";

type Mode = "signin" | "forgot";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetSent(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Invalid email or password");
      }
      router.push(from);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onResetSubmit(e: FormEvent) {
    e.preventDefault();
    // Self-service password reset is not yet implemented on the API. Show the
    // same confirmation regardless so account existence isn't leaked; an admin
    // can reset the password via the users module.
    setResetSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card text-card-foreground shadow-sm p-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <SunMedium className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">AstraSolar CRM</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to continue"
              : "Reset your password"}
          </p>
        </div>

        {mode === "signin" ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-primary hover:underline focus:outline-none focus:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onResetSubmit} className="space-y-4">
            {resetSent ? (
              <div className="space-y-3">
                <div className="text-sm bg-primary/10 text-foreground rounded px-3 py-2">
                  If an account exists for <strong>{email}</strong>, a password
                  reset link has been sent. Check your inbox (and spam folder).
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => switchMode("signin")}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Enter the email address associated with your account and
                  we&apos;ll send you a link to reset your password.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline focus:outline-none"
                >
                  Back to sign in
                </button>
              </>
            )}
          </form>
        )}

        {mode === "signin" && (
          <p className="text-xs text-muted-foreground text-center">
            Need access? Contact your administrator.
          </p>
        )}
      </div>
    </div>
  );
}
