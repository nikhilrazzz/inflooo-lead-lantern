import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addMinutes, format } from "date-fns";
import { BellRing, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, useMe, useReminders, type ReminderWithLead } from "@/lib/data";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const due: ReminderWithLead[] = (reminders ?? []).filter(
    (r) => !r.completed && r.user_id === me?.id && new Date(r.remind_at).getTime() <= now && !dismissed.has(r.id),
  );
  const current = due[0];

  useEffect(() => {
    if (!current) return;
    beep(audio);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("SaleUp: time to call", { body: `${current.leads?.full_name ?? "Lead"} · ${format(new Date(current.remind_at), "h:mm a")}` });
    }
    const t = setInterval(() => beep(audio), 8000);
    return () => clearInterval(t);
  }, [current?.id]);

  if (!current) return null;
  const done = async () => {
    await supabase.from("reminders").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", current.id);
    await logActivity(current.lead_id, me?.name ?? "Teammate", "Completed call");
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };
  const snooze = async (mins: number) => {
    await supabase.from("reminders").update({ remind_at: addMinutes(new Date(), mins).toISOString() }).eq("id", current.id);
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && setDismissed((s) => new Set(s).add(current.id))}>
      <DialogContent className="border-primary shadow-alarm sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <BellRing className="h-8 w-8 animate-alarm" />
          </div>
          <DialogTitle className="text-2xl">Time to call {current.leads?.full_name || "your lead"}</DialogTitle>
          <DialogDescription>
            Scheduled for {format(new Date(current.remind_at), "EEE d MMM, h:mm a")}
            {current.note ? ` — ${current.note}` : ""}
          </DialogDescription>
        </DialogHeader>
        {current.leads?.phone && (
          <Button asChild size="lg">
            <a href={`tel:+${current.leads.phone.replace(/\D/g, "")}`}><Phone className="h-4 w-4" /> Call {current.leads.phone}</a>
          </Button>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={done}>Mark done</Button>
          <Button variant="outline" onClick={() => snooze(10)}>Snooze 10m</Button>
          <Button variant="outline" onClick={() => { onOpenLead(current.lead_id); setDismissed((s) => new Set(s).add(current.id)); }}>Open lead</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
