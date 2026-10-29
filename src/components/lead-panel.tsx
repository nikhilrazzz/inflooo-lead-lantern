import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlarmClock, CheckCircle2, Phone, Send, StickyNote, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_STATUSES, logActivity, useLeads, useMe, useNotes, useReminders } from "@/lib/data";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";

export function LeadPanel({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { data: leads } = useLeads();
  const lead = leads?.find((l) => l.id === leadId) ?? null;
  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {lead ? <LeadBody key={lead.id} leadId={lead.id} /> : <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
      </SheetContent>
    </Sheet>
  );
}

function LeadBody({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { data: leads } = useLeads();
  const lead = leads!.find((l) => l.id === leadId)!;
  const { data: me } = useMe();
  const userName = me?.name ?? "Teammate";

  async function update(patch: Partial<typeof lead>, action: string, detail?: string) {
    const { error } = await supabase.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) return toast.error(error.message);
    await logActivity(lead.id, userName, action, detail);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
  }

  async function toggleOutreach() {
    if (lead.outreached) {
      await update({ outreached: false, outreached_at: null, outreached_by: null, outreached_by_name: null }, "Undid outreach");
    } else {
      await update(
        {
          outreached: true,
          outreached_at: new Date().toISOString(),
          outreached_by: me?.id ?? null,
          outreached_by_name: userName,
          status: lead.status === "New Lead" ? "Contacted" : lead.status,
        },
        "Marked outreached",
      );
      toast.success("Marked as outreached");
    }
  }

  return (
    <div className="space-y-6">
      <SheetHeader className="space-y-2 text-left">
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.status} />
          {lead.lead_type && <Badge variant="outline" className="capitalize">{lead.lead_type}</Badge>}
        </div>
        <SheetTitle className="text-2xl">{lead.full_name || "Unnamed lead"}</SheetTitle>
        <SheetDescription>
          {lead.lead_date ? `Lead from ${format(new Date(lead.lead_date + "T00:00"), "d MMM yyyy")}` : "No date"} · {lead.external_id}
        </SheetDescription>
      </SheetHeader>

      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
        <Info label="Phone" value={lead.phone ? <a className="font-medium text-primary" href={`tel:+${lead.phone.replace(/\D/g, "")}`}><Phone className="mr-1 inline h-3.5 w-3.5" />{lead.phone}</a> : "—"} />
        <Info label="Budget" value={lead.budget ?? "—"} />
        <Info label="Brand / niche" value={lead.brand_info ?? "—"} />
        <Info label="Deal value" value={lead.deal_value ? `₹${Number(lead.deal_value).toLocaleString("en-IN")}` : "—"} />
      </div>

      <section className="space-y-3">
        <Button
          variant={lead.outreached ? "outline" : "default"}
          className="w-full"
          size="lg"
          onClick={toggleOutreach}
        >
          {lead.outreached ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Send className="h-4 w-4" />}
          {lead.outreached ? "Outreached — tap to undo" : "Mark as outreached"}
        </Button>
        {lead.outreached && lead.outreached_at && (
          <p className="text-center text-xs text-muted-foreground">
            by {lead.outreached_by_name ?? "teammate"} on {format(new Date(lead.outreached_at), "d MMM, h:mm a")}
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={lead.status} onValueChange={(v) => update({ status: v }, "Changed status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from(new Set([...LEAD_STATUSES, lead.status])).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <ReminderSection leadId={lead.id} leadName={lead.full_name} userName={userName} />
      <NotesSection leadId={lead.id} userName={userName} myId={me?.id} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function ReminderSection({ leadId, leadName, userName }: { leadId: string; leadName: string; userName: string }) {
  const qc = useQueryClient();
  const { data: reminders } = useReminders();
  const mine = (reminders ?? []).filter((r) => r.lead_id === leadId);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");

  async function add() {
    if (!when) return toast.error("Pick a date and time");
    const at = new Date(when);
    const { error } = await supabase.from("reminders").insert({ lead_id: leadId, remind_at: at.toISOString(), note: note || null, user_name: userName });
    if (error) return toast.error(error.message);
    await logActivity(leadId, userName, "Scheduled call", format(at, "d MMM, h:mm a"));
    setWhen(""); setNote("");
    toast.success(`Reminder set for ${format(at, "d MMM, h:mm a")}`);
    qc.invalidateQueries({ queryKey: ["reminders"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
  }
  async function complete(id: string) {
    await supabase.from("reminders").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", id);
    await logActivity(leadId, userName, "Completed call");
    qc.invalidateQueries({ queryKey: ["reminders"] });
  }
  async function remove(id: string) {
    await supabase.from("reminders").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["reminders"] });
  }

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold"><AlarmClock className="h-4 w-4 text-primary" /> Call reminder</h3>
      <div className="space-y-2 rounded-xl border p-3">
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <Input placeholder={`What to discuss with ${leadName || "client"}? (optional)`} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={add} className="w-full" variant="secondary">Schedule call</Button>
      </div>
      {mine.map((r) => (
        <div key={r.id} className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${r.completed ? "opacity-60" : ""}`}>
          <div className="flex-1">
            <div className="font-medium">{format(new Date(r.remind_at), "EEE d MMM, h:mm a")}</div>
            <div className="text-xs text-muted-foreground">{r.note || "Follow-up call"} · {r.user_name}</div>
          </div>
          {r.completed ? (
            <Badge variant="outline" className="border-success text-success">Done</Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={() => complete(r.id)}>Done</Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => remove(r.id)} aria-label="Delete reminder"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
    </section>
  );
}

function NotesSection({ leadId, userName, myId }: { leadId: string; userName: string; myId?: string }) {
  const qc = useQueryClient();
  const { data: notes } = useNotes(leadId);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["notes", leadId] });

  async function add() {
    if (!text.trim()) return;
    const { error } = await supabase.from("lead_notes").insert({ lead_id: leadId, content: text.trim(), author_name: userName });
    if (error) return toast.error(error.message);
    await logActivity(leadId, userName, "Added note");
    setText(""); refresh();
    qc.invalidateQueries({ queryKey: ["activities"] });
  }
  async function save() {
    if (!editing) return;
    await supabase.from("lead_notes").update({ content: editing.text, updated_at: new Date().toISOString() }).eq("id", editing.id);
    setEditing(null); refresh();
  }
  async function remove(id: string) {
    await supabase.from("lead_notes").delete().eq("id", id);
    refresh();
  }

  return (
    <section className="space-y-3 pb-6">
      <h3 className="flex items-center gap-2 font-semibold"><StickyNote className="h-4 w-4 text-primary" /> Notes</h3>
      <Textarea
        placeholder="e.g. Client requested a callback tomorrow"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}
      />
      <Button onClick={add} variant="secondary" className="w-full" disabled={!text.trim()}>Save note</Button>
      <div className="space-y-2">
        {(notes ?? []).map((n) => (
          <div key={n.id} className="rounded-lg border bg-warning-soft/60 p-3 text-sm">
            {editing?.id === n.id ? (
              <div className="space-y-2">
                <Textarea value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={save}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{n.content}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{n.author_name} · {format(new Date(n.created_at), "d MMM, h:mm a")}</span>
                  {n.author_id === myId && (
                    <span className="ml-auto flex gap-2">
                      <button className="hover:text-foreground" onClick={() => setEditing({ id: n.id, text: n.content })}>Edit</button>
                      <button className="hover:text-destructive" onClick={() => remove(n.id)}>Delete</button>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
