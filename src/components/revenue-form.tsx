import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BrandRevenue } from "@/lib/revenue-data";
import { calculateProfit, formatMoney } from "@/lib/revenue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function RevenueForm({ entry, onClose }: { entry: BrandRevenue | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(entry?.brand_name ?? "");
  const [budget, setBudget] = useState(entry ? String(entry.budget) : "");
  const [payout, setPayout] = useState(entry ? String(entry.payout) : "");
  const [received, setReceived] = useState(entry?.payment_received ?? false);
  const [saving, setSaving] = useState(false);
  const profit = calculateProfit(Number(budget), Number(payout));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !budget || !payout) return;
    setSaving(true);
    try {
      const values = { brand_name: name.trim(), budget: Number(budget), payout: Number(payout), payment_received: received };
      const result = entry
        ? await supabase.from("brand_revenue").update(values).eq("id", entry.id).select().single()
        : await supabase.from("brand_revenue").insert(values).select().single();
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["revenue"] });
      toast.success(entry ? "Brand updated" : "Brand added");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save brand. Please try again.");
    } finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{entry ? "Edit brand" : "Add brand"}</DialogTitle>
        <DialogDescription className="sr-only">Brand revenue details</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="brand-name">Brand name</Label><Input autoFocus id="brand-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="brand-budget">Brand budget (₹)</Label><Input id="brand-budget" type="number" inputMode="decimal" min="0" max="999999999999.99" step="0.01" required value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="brand-payout">Payout (₹)</Label><Input id="brand-payout" type="number" inputMode="decimal" min="0" max="999999999999.99" step="0.01" required value={payout} onChange={(e) => setPayout(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-y py-4">
          <Label>Profit</Label><output aria-label="Calculated profit" className={`text-2xl font-bold tabular-nums ${profit < 0 ? "text-destructive" : "text-success"}`}>{budget && payout ? formatMoney(profit) : "—"}</output>
        </div>
        <div className="flex items-center justify-between"><Label htmlFor="payment-received">Payment received</Label><Switch id="payment-received" checked={received} onCheckedChange={setReceived} /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save brand"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}