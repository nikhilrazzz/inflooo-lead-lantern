import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { BellRing, CalendarDays, IndianRupee, LayoutDashboard, LogOut, RefreshCw, TrendingUp, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncLeadsFromSheet } from "@/lib/sheet-sync.functions";
import { useLastSync, useLiveUpdates, useMe } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadPanel } from "@/components/lead-panel";
import { ReminderAlarm } from "@/components/reminder-alarm";
import { GoogleCalendarConnection } from "@/components/google-calendar-connection";

type Ctx = { openLead: (id: string) => void; sync: () => Promise<void>; syncing: boolean };
const ShellCtx = createContext<Ctx | null>(null);
export const useShell = () => {
  const c = useContext(ShellCtx);
  if (!c) throw new Error("useShell outside AppShell");
  return c;
};

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/revenue", label: "Revenue", icon: IndianRupee },
  { to: "/reminders", label: "Reminders", icon: BellRing },
] as const;

export function AppShell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const syncFn = useServerFn(syncLeadsFromSheet);
  const { data: me } = useMe();
  const { data: lastSync, isFetched } = useLastSync();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const autoDone = useRef(false);
  useLiveUpdates();

  async function sync(silent = false) {
    setSyncing(true);
    try {
      const r = await syncFn();
      if (!silent || r.imported > 0)
        toast.success(r.imported ? `Imported ${r.imported} new lead${r.imported === 1 ? "" : "s"}` : "Already up to date");
    } catch (e) {
      toast.error(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["last-sync"] });
    }
  }

  // Auto-sync on open if the last sync is older than 10 minutes, then every 15 minutes while open.
  useEffect(() => {
    if (!isFetched || autoDone.current) return;
    autoDone.current = true;
    const stale = !lastSync || Date.now() - new Date(lastSync.ran_at).getTime() > 10 * 60_000;
    if (stale) sync(true);
    const t = setInterval(() => sync(true), 15 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { denied: undefined }, replace: true });
  }

  return (
    <ShellCtx.Provider value={{ openLead: setLeadId, sync: () => sync(false), syncing }}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <TrendingUp className="h-4 w-4" />
              </div>
              <span className="text-lg font-extrabold tracking-tight">SaleUp</span>
            </Link>
            <nav className="ml-4 hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  activeProps={{ className: "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground" }}
                >
                  <n.icon className="h-4 w-4" /> {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <Button asChild size="icon" variant="ghost"><Link to="/settings" aria-label="Settings" title="Settings"><Settings className="h-4 w-4" /></Link></Button>
              <div className="hidden text-right text-xs text-muted-foreground lg:block">
                {lastSync ? (
                  <>Synced {formatDistanceToNow(new Date(lastSync.ran_at), { addSuffix: true })}{!lastSync.ok && " · failed"}</>
                ) : (
                  "Not synced yet"
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => sync(false)} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync sheet"}</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full outline-none ring-ring focus-visible:ring-2">
                  <Avatar className="h-9 w-9">
                    {me?.avatar && <AvatarImage src={me.avatar} alt={me.name} />}
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {(me?.name ?? "?").slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <div className="font-semibold">{me?.name}</div>
                    <div className="text-xs font-normal text-muted-foreground">{me?.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/settings"><Settings className="h-4 w-4" /> Settings</Link></DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <nav className="flex border-t md:hidden">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground"
                activeProps={{ className: "text-primary" }}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <GoogleCalendarConnection>
            <Outlet />
            <LeadPanel leadId={leadId} onClose={() => setLeadId(null)} />
            <ReminderAlarm onOpenLead={setLeadId} />
          </GoogleCalendarConnection>
        </main>
      </div>
    </ShellCtx.Provider>
  );
}
