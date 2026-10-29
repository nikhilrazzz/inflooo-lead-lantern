import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedEmail } from "@/lib/access";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    if (!isAllowedEmail(data.user.email)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { denied: "1" } });
    }
  },
  component: AppShell,
});
