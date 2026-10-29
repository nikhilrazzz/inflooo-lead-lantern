import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TrendingUp, ShieldCheck } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { isAllowedEmail } from "@/lib/access";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — SaleUp" },
      { name: "description", content: "Sign in to SaleUp with your company Google account." },
      { property: "og:title", content: "Sign in — SaleUp" },
      { property: "og:description", content: "Sign in to SaleUp with your company Google account." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ denied: s["denied"] === "1" ? "1" : undefined }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { denied } = Route.useSearch();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (denied) toast.error("Only @inflooo.com and @makeitviral.ai accounts can access SaleUp.");
    if (window.location.hash.includes("error=")) {
      toast.error("Google sign-in didn't complete. Please try again with your company account.");
      history.replaceState(null, "", window.location.pathname);
    }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      if (isAllowedEmail(data.user.email)) navigate({ to: "/dashboard", replace: true });
      else {
        await supabase.auth.signOut();
        toast.error("Only @inflooo.com and @makeitviral.ai accounts can access SaleUp.");
      }
    });
  }, [denied, navigate]);

  async function signIn() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      setLoading(false);
      toast.error(
        /inflooo|makeitviral|Database error/i.test(result.error.message ?? "")
          ? "Only @inflooo.com and @makeitviral.ai accounts can access SaleUp."
          : result.error.message ?? "Sign-in failed",
      );
      return;
    }
    if (result.redirected) return;
    const { data } = await supabase.auth.getUser();
    if (!isAllowedEmail(data.user?.email)) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("Only @inflooo.com and @makeitviral.ai accounts can access SaleUp.");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-card">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <TrendingUp className="h-5 w-5" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">SaleUp</span>
        </div>
        <h1 className="text-xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in with your company Google account.</p>
        <Button className="mt-6 w-full" size="lg" onClick={signIn} disabled={loading}>
          {loading ? "Signing in…" : "Continue with Google"}
        </Button>
        <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Access is limited to @inflooo.com and @makeitviral.ai team members.
        </p>
      </div>
    </div>
  );
}
