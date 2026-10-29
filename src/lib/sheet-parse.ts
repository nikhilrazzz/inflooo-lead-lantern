export type ParsedLead = {
  external_id: string;
  lead_date: string | null;
  full_name: string;
  phone: string | null;
  lead_type: string | null;
  budget: string | null;
  brand_info: string | null;
  status: string;
  deal_value: number | null;
  raw: Record<string, string>;
};

/** Parses "MM-DD-YY", "MM/DD/YYYY", or ISO-ish dates into YYYY-MM-DD. */
export function parseSheetDate(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const clean = (s: string | undefined) => (s ?? "").replace(/_/g, " ").trim() || null;

export function parseSheetRows(values: string[][]): ParsedLead[] {
  if (values.length < 2) return [];
  const headerRow = values[0] ?? [];
  const headers = headerRow.map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const idx = {
    date: col("created"),
    type: col("are you"),
    budget: col("budget"),
    brand: col("brand"),
    name: col("full name"),
    phone: col("phone"),
    id: col("lead id"),
    status: col("crm status"),
    deal: col("deal value"),
  };
  const seen = new Set<string>();
  const out: ParsedLead[] = [];
  for (const row of values.slice(1)) {
    const get = (i: number) => (i >= 0 ? row[i]?.trim() : undefined);
    const name = get(idx.name) ?? "";
    const phone = get(idx.phone) ?? "";
    if (!name && !phone) continue;
    const date = parseSheetDate(get(idx.date));
    const external_id = get(idx.id) || `${phone || name}|${date ?? ""}`;
    if (seen.has(external_id)) continue;
    seen.add(external_id);
    const raw: Record<string, string> = {};
    headerRow.forEach((h, i) => { const v = row[i]; if (v) raw[h] = v; });
    const deal = Number((get(idx.deal) ?? "").replace(/[^\d.]/g, ""));
    out.push({
      external_id,
      lead_date: date,
      full_name: name,
      phone: phone || null,
      lead_type: clean(get(idx.type)),
      budget: clean(get(idx.budget)),
      brand_info: clean(get(idx.brand)),
      status: get(idx.status) || "New Lead",
      deal_value: deal > 0 ? deal : null,
      raw,
    });
  }
  return out;
}
