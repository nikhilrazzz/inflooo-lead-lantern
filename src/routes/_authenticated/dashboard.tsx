import { createFileRoute, Link } from "@tanstack/react-router";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { AlarmClock, AlertTriangle, CheckCircle2, Clock, Sparkles, Users } from "lucide-react";
import { isFollowedUp, useActivities, useLeads, useMe, useReminders } from "@/lib/data";
import { LeadRow } from "@/components/lead-row";
import { useShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — SaleUp" },
      { name: "description", content: "Today's leads, follow-ups and sales activity at a glance." },
      { property: "og:title", content: "Overview — SaleUp" },
      { property: "og:description", content: "Today's leads, follow-ups and sales activity at a glance." },
    ],
  }),
  component: Dashboard,
});

function Stat({ icon: Icon, label, value, sub, tone = "primary" }: { icon: typeof Users; label: string; value: number | string; sub?: string; tone?: "primary" | "success" | "warning" | "destructive" }) {
  const tones = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    destructive: "bg-primary-soft text-destructive",
  };
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div className="text-3xl font-extrabold tracking-tight">{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Dashboard() {
  const { data: leads = [], isLoading } = useLeads();
  const { data: reminders = [] } = useReminders();
  const { data: activities = [] } = useActivities(12);
  const { data: me } = useMe();
  const { openLead } = useShell();

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const latestKey = leads[0]?.lead_date ?? todayKey;
  const todays = leads.filter((l) => l.lead_date === todayKey);
  const followed = leads.filter(isFollowedUp).length;
  const pending = leads.filter((l) => !isFollowedUp(l));
  const now = Date.now();
  const open = reminders.filter((r) => !r.completed);
  const overdue = open.filter((r) => new Date(r.remind_at).getTime() < now);
  const upcoming = open.filter((r) => new Date(r.remind_at).getTime() >= now).slice(0, 6);
  const showList = todays.length ? todays : leads.filter((l) => l.lead_date === latestKey);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Hi {me?.name?.split(" ")[0] ?? "there"} 👋</h1>
        <p className="mt-1 text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Users} label="Total leads generated" value={isLoading ? "…" : leads.length} sub={`${todays.length} today`} />
        <Stat icon={CheckCircle2} label="Total followed up" value={followed} sub={leads.length ? `${Math.round((followed / leads.length) * 100)}% of all leads` : undefined} tone="success" />
        <Stat icon={Clock} label="Pending follow-ups" value={pending.length} tone="warning" />
        <Stat icon={AlertTriangle} label="Overdue reminders" value={overdue.length} tone="destructive" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-end justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="h-5 w-5 text-primary" />
              {todays.length ? "Today's new leads" : `Latest leads${leads[0]?.lead_date ? ` · ${format(new Date(latestKey + "T00:00"), "d MMM")}` : ""}`}
            </h2>
            <Link to="/calendar" className="text-sm font-medium text-primary">Open calendar →</Link>
          </div>
          {showList.length === 0 && <Empty text={isLoading ? "Loading leads…" : "No leads yet. Hit “Sync sheet” to import."} />}
          <div className="space-y-2">{showList.slice(0, 12).map((l) => <LeadRow key={l.id} lead={l} />)}</div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><AlarmClock className="h-4 w-4 text-primary" /> Upcoming calls</h2>
            {overdue.length > 0 && (
              <div className="mb-3 space-y-2">
                {overdue.slice(0, 4).map((r) => (
                  <button key={r.id} onClick={() => openLead(r.lead_id)} className="flex w-full items-center justify-between rounded-lg bg-primary-soft px-3 py-2 text-left text-sm">
                    <span className="font-medium">{r.leads?.full_name}</span>
                    <span className="text-xs font-semibold text-destructive">Overdue · {formatDistanceToNow(new Date(r.remind_at))}</span>
                  </button>
                ))}
              </div>
            )}
            {upcoming.length === 0 && overdue.length === 0 && <p className="text-sm text-muted-foreground">No calls scheduled.</p>}
            <div className="space-y-2">
              {upcoming.map((r) => (
                <button key={r.id} onClick={() => openLead(r.lead_id)} className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="font-medium">{r.leads?.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {isToday(new Date(r.remind_at)) ? format(new Date(r.remind_at), "h:mm a") : format(new Date(r.remind_at), "d MMM, h:mm a")}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="mb-3 font-bold">Recent activity</h2>
            {activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            <ol className="space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <button className="text-left" onClick={() => openLead(a.lead_id)}>
                      <span className="font-semibold">{a.user_name}</span> {a.action.toLowerCase()}{" "}
                      <span className="font-semibold">{a.leads?.full_name}</span>
                      {a.detail ? <span className="text-muted-foreground"> · {a.detail}</span> : null}
                    </button>
                    <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
