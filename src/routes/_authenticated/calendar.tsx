import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday,
  startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isFollowedUp, useLeads, useReminders, type Lead } from "@/lib/data";
import { LeadRow } from "@/components/lead-row";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Lead Calendar — SaleUp" },
      { name: "description", content: "Browse daily leads and scheduled calls by day, week or month." },
      { property: "og:title", content: "Lead Calendar — SaleUp" },
      { property: "og:description", content: "Browse daily leads and scheduled calls by day, week or month." },
    ],
  }),
  component: CalendarPage,
});

type View = "day" | "week" | "month";
const key = (d: Date) => format(d, "yyyy-MM-dd");

function CalendarPage() {
  const { data: leads = [] } = useLeads();
  const { data: reminders = [] } = useReminders();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");

  const byDate = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of leads) if (l.lead_date) m.set(l.lead_date, [...(m.get(l.lead_date) ?? []), l]);
    return m;
  }, [leads]);
  const callsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reminders) if (!r.completed) { const k = key(new Date(r.remind_at)); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [reminders]);

  const days =
    view === "month"
      ? eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) })
      : view === "week"
        ? eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) })
        : [cursor];

  const move = (dir: 1 | -1) => {
    const next = view === "month" ? (dir > 0 ? addMonths : subMonths)(cursor, 1) : view === "week" ? (dir > 0 ? addWeeks : subWeeks)(cursor, 1) : (dir > 0 ? addDays : subDays)(cursor, 1);
    setCursor(next);
    if (view === "day") setSelected(next);
  };

  const dayLeads = (byDate.get(key(selected)) ?? []).filter((l) => filter === "all" || (filter === "done" ? isFollowedUp(l) : !isFollowedUp(l)));
  const title = view === "month" ? format(cursor, "MMMM yyyy") : view === "week" ? `${format(days[0]!, "d MMM")} – ${format(days[6]!, "d MMM yyyy")}` : format(cursor, "EEEE, d MMM yyyy");

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <h1 className="text-lg font-bold">{title}</h1>
          <Button size="sm" variant="outline" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Today</Button>
          <Tabs value={view} onValueChange={(v) => { setView(v as View); if (v === "day") setCursor(selected); }} className="ml-auto">
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view !== "day" && (
          <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
        )}
        <div className={cn("grid gap-1.5", view === "day" ? "grid-cols-1" : "grid-cols-7")}>
          {days.map((d) => {
            const ls = byDate.get(key(d)) ?? [];
            const pending = ls.filter((l) => !isFollowedUp(l)).length;
            const calls = callsByDate.get(key(d)) ?? 0;
            const active = isSameDay(d, selected);
            return (
              <button
                key={key(d)}
                onClick={() => setSelected(d)}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-2 text-left transition-colors",
                  view === "month" ? "min-h-20" : "min-h-32",
                  view === "month" && !isSameMonth(d, cursor) && "opacity-40",
                  active ? "border-primary bg-primary-soft" : "hover:bg-muted",
                )}
              >
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", isToday(d) && "bg-primary text-primary-foreground")}>
                  {format(d, "d")}
                </span>
                {ls.length > 0 && (
                  <span className="mt-auto w-full space-y-0.5">
                    <span className="block truncate text-xs font-bold text-primary">{ls.length} lead{ls.length > 1 ? "s" : ""}</span>
                    {pending > 0 && <span className="hidden truncate text-[10px] text-muted-foreground sm:block">{pending} pending</span>}
                  </span>
                )}
                {calls > 0 && <span className="mt-0.5 hidden truncate text-[10px] font-medium text-warning sm:block">📞 {calls} call{calls > 1 ? "s" : ""}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{format(selected, "EEEE, d MMM")}</h2>
            <p className="text-sm text-muted-foreground">{byDate.get(key(selected))?.length ?? 0} leads</p>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="done">Followed up</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {dayLeads.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No leads for this day.</div>}
        <div className="space-y-2">{dayLeads.map((l) => <LeadRow key={l.id} lead={l} />)}</div>
      </section>
    </div>
  );
}
