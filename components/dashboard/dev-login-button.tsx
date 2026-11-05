"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

type DevLoginButtonProps = {
  /** When true, auto-trigger login once on mount (dev convenience). */
  autoLogin?: boolean;
  className?: string;
};

export function DevLoginButton({
  autoLogin = false,
  className,
}: DevLoginButtonProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const autoStarted = React.useRef(false);

  const login = React.useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "ההתחברות נכשלה");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההתחברות נכשלה");
    } finally {
      setPending(false);
    }
  }, [router]);

  React.useEffect(() => {
    if (!autoLogin || autoStarted.current) return;
    autoStarted.current = true;
    void login();
  }, [autoLogin, login]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
        <p className="flex-1">
          מצב פיתוח — התחברו כמשתמש בדיקה כדי לטעון קבוצות לדוגמה מיד.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => void login()}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          התחבר כמשתמש בדיקה
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
