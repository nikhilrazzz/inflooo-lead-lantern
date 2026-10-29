import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type BrandRevenue = Tables<"brand_revenue">;
export const revenueOptions = queryOptions({
  queryKey: ["revenue"],
  refetchInterval: 30_000,
  queryFn: async () => {
    const rows: BrandRevenue[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("brand_revenue").select("*")
        .order("created_at", { ascending: false }).order("id").range(from, from + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  },
});