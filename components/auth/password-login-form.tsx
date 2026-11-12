"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type AuthMode = "login" | "register";

type PasswordLoginFormProps = {
  className?: string;
};

export function PasswordLoginForm({ className }: PasswordLoginFormProps) {
  const router = useRouter();
  const { dir, t } = useI18n();
  const [mode, setMode] = React.useState<AuthMode>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const endpoint =
        mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(
          data.error ||
            (mode === "register" ? t("registerFailed") : t("loginFailed"))
        );
      }
      router.replace(data.redirectTo || "/dashboard/channels");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "register"
            ? t("registerFailed")
            : t("loginFailed")
      );
    } finally {
      setPending(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className={className ?? "space-y-3"}
      dir={dir}
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className={`h-9 rounded-md text-sm font-medium transition-colors ${
            !isRegister
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("loginSubmit")}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
          }}
          className={`h-9 rounded-md text-sm font-medium transition-colors ${
            isRegister
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("registerSubmit")}
        </button>
      </div>

      <div className="space-y-1 text-start">
        <label htmlFor="login-email" className="text-sm font-medium">
          {t("loginEmail")}
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1 text-start">
        <label htmlFor="login-password" className="text-sm font-medium">
          {t("loginPassword")}
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 8 : 1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="••••••••"
        />
        {isRegister ? (
          <p className="text-xs text-muted-foreground">{t("registerHint")}</p>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : isRegister ? (
          <UserPlus className="size-4" aria-hidden />
        ) : (
          <LogIn className="size-4" aria-hidden />
        )}
        {isRegister ? t("registerSubmit") : t("loginSubmit")}
      </button>
    </form>
  );
}
