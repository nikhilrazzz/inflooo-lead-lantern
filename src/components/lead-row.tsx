import { CheckCircle2, ChevronRight, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, useMe, type Lead } from "@/lib/data";
import { useShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export function LeadRow({ lead }: { lead: Lead }) {
  const { openLead } = useShell();
  const { data: me } = useMe();
  const qc = useQueryClient();

  async function markOutreached(e: React.MouseEvent) {
    e.stopPropagation();
    if (lead.outreached) return openLead(lead.id);
    const { error } = await supabase
      .from("leads")
      .update({
        outreached: true,
        outreached_at: new Date().toISOString(),
        outreached_by: me?.id ?? null,
        outreached_by_name: me?.name ?? null,
        status: lead.status === "New Lead" ? "Contacted" : lead.status,
      })
      .eq("id", lead.id);
    if (error) return toast.error(error.message);
    await logActivity(lead.id, me?.name ?? "Teammate", "Marked outreached");
    toast.success(`${lead.full_name} marked as outreached`);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openLead(lead.id)}
      onKeyDown={(e) => e.key === "Enter" && openLead(lead.id)}
      className="group flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
        {(lead.full_name.replace(/[^a-zA-Z]/g, "") || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{lead.full_name || "Unnamed"}</span>
          <StatusBadge status={lead.status} className="hidden sm:inline-flex" />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {[lead.phone, lead.lead_type, lead.budget, lead.brand_info].filter(Boolean).join(" · ")}
        </div>
      </div>
      <Button size="sm" variant={lead.outreached ? "outline" : "default"} onClick={markOutreached}>
        {lead.outreached ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Send className="h-4 w-4" />}
        <span className="hidden sm:inline">{lead.outreached ? "Outreached" : "Outreach"}</span>
      </Button>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
