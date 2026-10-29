import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addMinutes, format } from "date-fns";
import { BellRing, Phone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, useMe, useReminders, type ReminderWithLead } from "@/lib/data";
import { toast } from "sonner";
import { useNotificationPreferences, useAlertReceipts } from "@/lib/notification-data";
import { reminderAlertKey, shouldAlert } from "@/lib/notifications";
import { Button } from "@/components/ui/button";

function beep(ctxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const ctx = (ctxRef.current ??= new AudioContext());
    [0, 0.3, 0.6].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.25);
    });
  } catch {
    /* audio blocked until user interacts */
  }
}

/** Rings for the signed-in user's own due, uncompleted reminders. */
export function ReminderAlarm({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: reminders } = useReminders();
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const audio = useRef<AudioContext | null>(null);
  const { data: prefs } = useNotificationPreferences();
  const { data: receipts, isFetched: receiptsReady } = useAlertReceipts();
  const notified = useRef(new Set<string>());
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const dismissedKeys = new Set([...dismissed, ...(receipts ?? []).map(r => r.event_key)]);
  const due: ReminderWithLead[] = prefs?.in_app_enabled === false || !receiptsReady ? [] : (reminders ?? []).filter(
    r => !!me && shouldAlert(r, me.id, now, dismissedKeys),
  );
  const current = due[0];

  useEffect(() => {
    if (!current) return;
    setReceivedAt(Date.now());
    beep(audio);
    const eventKey = reminderAlertKey(current);
    if (!notified.current.has(eventKey) && !prefs?.push_enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const notification = new Notification("SaleUp: time to call", { tag: eventKey, body: `${current.leads?.full_name ?? "Lead"} · ${format(new Date(current.remind_at), "h:mm a")}` });
      notification.onclick = () => { window.focus(); onOpenLead(current.lead_id); notification.close(); };
      notified.current.add(eventKey);
    }
    const t = setInterval(() => beep(audio), 8000);
    return () => clearInterval(t);
  }, [current?.id, current?.remind_at]);

  if (!current) return null;
  async function dismiss() {
    if (!current || !me) return;
    const eventKey = reminderAlertKey(current);
    setDismissed(previous => new Set(previous).add(eventKey));
    const { error } = await supabase.from('notification_receipts').upsert({ user_id: me.id, event_key: eventKey, in_app_dismissed: true }, { onConflict: 'user_id,event_key' });
    if (error) toast.error('Alert dismissed for this session; could not save dismissal.');
    qc.invalidateQueries({ queryKey: ['alert-receipts'] });
  }
  async function updateReminder(snooze: boolean) {
    if (!current) return;
    setBusy(true);
    try {
      const patch = snooze ? { remind_at: addMinutes(new Date(), 10).toISOString() } : { completed: true, completed_at: new Date().toISOString() };
      const { error } = await supabase.from('reminders').update(patch).eq('id', current.id);
      if (error) throw error;
      if (!snooze) await logActivity(current.lead_id, me?.name ?? 'Teammate', 'Completed call');
      await qc.invalidateQueries({ queryKey: ['reminders'] });
    } catch { toast.error('Could not update this call. Please try again.'); }
    finally { setBusy(false); }
  }
  return <aside role="alert" aria-label="Call reminder" className="fixed right-4 top-20 z-50 w-[calc(100%-2rem)] max-w-sm rounded-lg border border-primary bg-card p-4 shadow-alarm motion-safe:animate-in motion-safe:slide-in-from-right-5 motion-safe:fade-in">
    <div className="flex items-start gap-3">
      <BellRing className="mt-1 h-6 w-6 shrink-0 text-primary motion-safe:animate-alarm" />
      <div className="min-w-0 flex-1"><h2 className="break-words font-bold">Time to call {current.leads?.full_name || 'your lead'}</h2><p className="mt-1 text-xs text-muted-foreground">Received {format(receivedAt, 'h:mm a')} · {due.length > 1 ? `${due.length} calls due` : 'Call due'}</p></div>
      <Button size="icon" variant="ghost" aria-label="Dismiss call reminder" onClick={dismiss}><X className="h-4 w-4" /></Button>
    </div>
    <p className="mt-3 break-words text-sm text-muted-foreground">Scheduled {format(new Date(current.remind_at), 'EEE d MMM, h:mm a')}{current.note ? ` — ${current.note}` : ''}</p>
    {current.leads?.phone && <Button asChild size="sm" variant="outline" className="mt-3 w-full"><a href={`tel:+${current.leads.phone.replace(/\D/g, '')}`}><Phone className="h-4 w-4" />Call {current.leads.phone}</a></Button>}
    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => updateReminder(false)} disabled={busy}>Mark done</Button><Button size="sm" variant="outline" onClick={() => updateReminder(true)} disabled={busy}>Snooze 10m</Button><Button size="sm" variant="ghost" onClick={() => { onOpenLead(current.lead_id); dismiss(); }}>Open lead</Button></div>
  </aside>;
}
