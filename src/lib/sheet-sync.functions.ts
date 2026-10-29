import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseSheetRows } from "./sheet-parse";

const SPREADSHEET_ID = "1OHU48leRb6xpQMajddu0IcI0L5Dtyw-4ERe8CwwKsrw";
const RANGE = "Sheet1!A1:Z5000";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

export const syncLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    const email = String((claims as { email?: string }).email ?? "").toLowerCase();
    if (!/@(inflooo\.com|makeitviral\.com)$/.test(email)) throw new Error("Not authorized");

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
    if (!lovableKey || !sheetsKey) throw new Error("Google Sheets connection is not configured");

    const res = await fetch(`${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Sheets sync failed [${res.status}]: ${body}`);
      await supabase.from("sync_runs").insert({ ok: false, message: `Sheet error ${res.status}` });
      throw new Error(`Could not read the Google Sheet (status ${res.status})`);
    }
    const json = (await res.json()) as { values?: string[][] };
    const rows = parseSheetRows(json.values ?? []);

    const { data: existing, error: exErr } = await supabase.from("leads").select("external_id");
    if (exErr) throw new Error(exErr.message);
    const known = new Set((existing ?? []).map((r) => r.external_id));
    const fresh = rows.filter((r) => !known.has(r.external_id));

    let imported = 0;
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      const { error } = await supabase
        .from("leads")
        .upsert(chunk, { onConflict: "external_id", ignoreDuplicates: true });
      if (error) {
        await supabase.from("sync_runs").insert({ ok: false, message: error.message, total: rows.length });
        throw new Error(error.message);
      }
      imported += chunk.length;
    }
    await supabase.from("sync_runs").insert({ ok: true, imported, total: rows.length });
    return { imported, total: rows.length };
  });
