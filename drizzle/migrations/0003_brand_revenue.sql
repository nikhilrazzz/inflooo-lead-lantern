CREATE TABLE public.brand_revenue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_name text NOT NULL CHECK (length(trim(brand_name)) > 0),
 budget numeric(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
 payout numeric(14,2) NOT NULL DEFAULT 0 CHECK (payout >= 0),
 profit numeric(14,2) GENERATED ALWAYS AS (budget - payout) STORED,
 payment_received boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_revenue TO authenticated;
GRANT ALL ON public.brand_revenue TO service_role;
ALTER TABLE public.brand_revenue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads revenue" ON public.brand_revenue FOR SELECT TO authenticated USING (public.is_team_member());
CREATE POLICY "Team adds revenue" ON public.brand_revenue FOR INSERT TO authenticated WITH CHECK (public.is_team_member());
CREATE POLICY "Team edits revenue" ON public.brand_revenue FOR UPDATE TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member());
CREATE POLICY "Team deletes revenue" ON public.brand_revenue FOR DELETE TO authenticated USING (public.is_team_member());