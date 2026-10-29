import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, IndianRupee, Pencil, Plus, Search, Wallet, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";
import { revenueOptions, type BrandRevenue } from "@/lib/revenue-data";
import { formatMoney } from "@/lib/revenue";
import { supabase } from "@/integrations/supabase/client";
import { RevenueForm } from "@/components/revenue-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/revenue")({
  head: () => ({ meta: [
    { title: "Brand Revenue — SaleUp" },
    { name: "description", content: "Track brand budgets, payouts, profits and received payments with SaleUp." },
    { property: "og:title", content: "Brand Revenue — SaleUp" },
    { property: "og:description", content: "Track brand budgets, payouts, profits and received payments with SaleUp." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(revenueOptions),
  component: RevenuePage,
});

function RevenuePage() {
  const { data: entries } = useSuspenseQuery(revenueOptions);
  const qc = useQueryClient();
  const [editor, setEditor] = useState<{ entry: BrandRevenue | null } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const total = (key: "budget" | "payout" | "profit") => entries.reduce((sum, row) => sum + Number(row[key]), 0);
  const pending = entries.filter((row) => !row.payment_received).reduce((sum, row) => sum + Number(row.budget), 0);
  const list = entries.filter((row) => row.brand_name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || row.payment_received === (filter === "received")));

  async function togglePayment(row: BrandRevenue) {
    setBusy(row.id);
    try {
      const { error } = await supabase.from("brand_revenue").update({ payment_received: !row.payment_received }).eq("id", row.id).select().single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["revenue"] });
      toast.success(row.payment_received ? "Payment marked pending" : "Payment marked received");
    } catch { toast.error("Could not update payment. Please try again."); }
    finally { setBusy(null); }
  }

  const stats = [
    { label: "Total brand budget", value: total("budget"), icon: IndianRupee, tone: "text-primary bg-primary-soft" },
    { label: "Total payout", value: total("payout"), icon: Wallet, tone: "text-muted-foreground bg-muted" },
    { label: "Total profit", value: total("profit"), icon: TrendingUp, tone: "text-success bg-success-soft" },
    { label: "Payment pending", value: pending, icon: Clock, tone: "text-warning bg-warning-soft" },
  ];

  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Revenue</h1><p className="mt-1 text-sm text-muted-foreground">{entries.length} {entries.length === 1 ? "brand" : "brands"}</p></div><Button onClick={() => setEditor({ entry: null })}><Plus className="h-4 w-4" /> Add brand</Button></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="min-w-0 rounded-lg border bg-card p-4 shadow-card sm:p-5"><span className={`mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg ${stat.tone}`}><stat.icon className="h-5 w-5" /></span><div className={`break-words text-xl font-bold tabular-nums sm:text-2xl ${stat.label === "Total profit" && stat.value < 0 ? "text-destructive" : ""}`}>{formatMoney(stat.value)}</div><div className="mt-1 text-sm text-muted-foreground">{stat.label}</div></div>)}</div>
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><Tabs value={filter} onValueChange={setFilter}><TabsList><TabsTrigger value="all">All brands</TabsTrigger><TabsTrigger value="pending">Pending</TabsTrigger><TabsTrigger value="received">Received</TabsTrigger></TabsList></Tabs><div className="relative w-full sm:w-64"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search brands" placeholder="Search brands" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
      {list.length ? <div className="overflow-x-auto border-y"><table className="w-full min-w-[700px] text-sm"><thead className="bg-muted/60 text-muted-foreground"><tr>{["Brand", "Budget", "Payout", "Profit", "Payment", ""].map((label) => <th key={label} className="px-4 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{list.map((row) => <tr key={row.id} className="bg-card"><td className="max-w-64 break-words px-4 py-4 font-semibold">{row.brand_name}</td><td className="whitespace-nowrap px-4 py-4 tabular-nums">{formatMoney(row.budget)}</td><td className="whitespace-nowrap px-4 py-4 tabular-nums">{formatMoney(row.payout)}</td><td className={`whitespace-nowrap px-4 py-4 font-semibold tabular-nums ${row.profit < 0 ? "text-destructive" : "text-success"}`}>{formatMoney(row.profit)}</td><td className="px-4 py-4"><Button variant="ghost" size="sm" aria-label={`Payment for ${row.brand_name}: ${row.payment_received ? "received" : "pending"}`} disabled={busy !== null} onClick={() => togglePayment(row)} className={row.payment_received ? "text-success hover:text-success" : "text-warning hover:text-warning"}>{row.payment_received ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}{row.payment_received ? "Received" : "Pending"}</Button></td><td className="px-4 py-4"><Button variant="ghost" size="icon" title={`Edit ${row.brand_name}`} aria-label={`Edit ${row.brand_name}`} onClick={() => setEditor({ entry: row })}><Pencil className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div> : <div className="border-y py-16 text-center"><IndianRupee className="mx-auto mb-3 h-8 w-8 text-primary" /><h2 className="font-semibold">{entries.length ? "No matching brands" : "No brands yet"}</h2>{!entries.length && <Button variant="outline" className="mt-4" onClick={() => setEditor({ entry: null })}><Plus className="h-4 w-4" /> Add brand</Button>}</div>}
    </section>
    {editor && <RevenueForm entry={editor.entry} onClose={() => setEditor(null)} />}
  </div>;
}