import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Lead = Tables<"leads">;
export type Note = Tables<"lead_notes">;
export type Reminder = Tables<"reminders">;
export type Activity = Tables<"lead_activities">;

export const LEAD_STATUSES = ["New Lead", "Contacted", "Interested", "Follow-up", "Proposal Sent", "Won", "Lost"];

async function fetchAllLeads(): Promise<Lead[]> {
  const out: Lead[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("lead_date", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function useLeads() {
  return useQuery({ queryKey: ["leads"], queryFn: fetchAllLeads });
}

export function useReminders() {
  return useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminders")
        .select("*, leads(full_name, phone)")
        .order("remind_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
export type ReminderWithLead = NonNullable<ReturnType<typeof useReminders>["data"]>[number];

export function useActivities(limit = 15) {
  return useQuery({
    queryKey: ["activities", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*, leads(full_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNotes(leadId: string | null) {
  return useQuery({
    queryKey: ["notes", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_notes")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLastSync() {
  return useQuery({
    queryKey: ["last-sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_runs")
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return null;
      const meta = u.user_metadata ?? {};
      return {
        id: u.id,
        email: u.email ?? "",
        name: (meta.full_name as string) || (meta.name as string) || (u.email ?? "").split("@")[0],
        avatar: (meta.avatar_url as string) || (meta.picture as string) || null,
      };
    },
  });
}

/** Keeps leads, reminders and activity fresh across the team. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`saleup-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () =>
        qc.invalidateQueries({ queryKey: ["leads"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, () =>
        qc.invalidateQueries({ queryKey: ["reminders"] }),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_activities" }, () =>
        qc.invalidateQueries({ queryKey: ["activities"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

export async function logActivity(leadId: string, userName: string, action: string, detail?: string) {
  await supabase.from("lead_activities").insert({ lead_id: leadId, user_name: userName, action, detail });
}

export function isFollowedUp(l: Lead) {
  return l.outreached || (l.status !== "New Lead" && l.status !== "");
}
