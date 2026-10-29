import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { AlarmClock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, useMe, useReminders, type ReminderWithLead } from "@/lib/data";
import { useShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/reminders")({
  head: () => ({
    meta: [
      { title: "Call Reminders — SaleUp" },
      { name: "description", content: "Upcoming, overdue and completed follow-up calls." },
      { property: "og:title", content: "Call Reminders — SaleUp" },
      { property: "og:description", content: "Upcoming, overdue and completed follow-up calls." },
    ],
  }),
  component: RemindersPage,
});

function RemindersPage() {
  const { data: reminders = [] } = useReminders();
  const { data: me } = useMe();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const now = Date.now();
  const list = reminders.filter((r) => scope === "team" || r.user_id === me?.id);
  const overdue = list.filter((r) => !r.completed && new Date(r.remind_at).getTime() < now);
  const upcoming = list.filter((r) => !r.completed && new Date(r.remind_at).getTime() >= now);
  const done = list.filter((r) => r.completed).reverse().slice(0, 20);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Call reminders</h1>
        <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
          <TabsList>
            <TabsTrigger value="mine">My calls</TabsTrigger>
            <TabsTrigger value="team">Whole team</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Group title="Overdue" items={overdue} tone="overdue" />
      <Group title="Upcoming" items={upcoming} />
      <Group title="Completed" items={done} />
    </div>
  );
}

function Group({ title, items, tone }: { title: string; items: ReminderWithLead[]; tone?: "overdue" }) {
  return (
    <section className="space-y-2">
      <h2 className={`text-sm font-bold uppercase tracking-wide ${tone ? "text-destructive" : "text-muted-foreground"}`}>{title} · {items.length}</h2>
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
      {items.map((r) => <ReminderItem key={r.id} r={r} overdue={!!tone} />)}
    </section>
  );
}

function ReminderItem({ r, overdue }: { r: ReminderWithLead; overdue: boolean }) {
  const qc = useQueryClient();
  const { openLead } = useShell();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(format(new Date(r.remind_at), "yyyy-MM-dd'T'HH:mm"));
  const refresh = () => qc.invalidateQueries({ queryKey: ["reminders"] });

  async function complete() {
    await supabase.from("reminders").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", r.id);
    await logActivity(r.lead_id, me?.name ?? "Teammate", "Completed call");
    refresh();
  }
  async function reschedule() {
    const at = new Date(when);
    await supabase.from("reminders").update({ remind_at: at.toISOString(), completed: false }).eq("id", r.id);
    await logActivity(r.lead_id, me?.name ?? "Teammate", "Rescheduled call", format(at, "d MMM, h:mm a"));
    toast.success("Rescheduled");
    setEditing(false); refresh();
  }

  return (
    <div className={`rounded-xl border bg-card p-4 ${overdue ? "border-primary/50 bg-primary-soft" : ""} ${r.completed ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <AlarmClock className={`h-5 w-5 ${overdue ? "text-destructive" : "text-primary"}`} />
        <button className="min-w-0 flex-1 text-left" onClick={() => openLead(r.lead_id)}>
          <div className="font-semibold">{r.leads?.full_name || "Lead"} <span className="font-normal text-muted-foreground">· {r.leads?.phone}</span></div>
          <div className="text-sm text-muted-foreground">
            {format(new Date(r.remind_at), "EEE d MMM, h:mm a")} ({formatDistanceToNow(new Date(r.remind_at), { addSuffix: true })}) · {r.user_name}
            {r.note ? ` · ${r.note}` : ""}
          </div>
        </button>
        {!r.completed ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>Reschedule</Button>
            <Button size="sm" onClick={complete}><CheckCircle2 className="h-4 w-4" /> Done</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>Reschedule</Button>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex gap-2">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <Button onClick={reschedule}>Save</Button>
        </div>
      )}
    </div>
  );
}
