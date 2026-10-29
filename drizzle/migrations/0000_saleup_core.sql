
create or replace function public.is_company_email(_email text)
returns boolean language sql immutable set search_path = public as $$
  select lower(split_part(coalesce(_email,''), '@', 2)) in ('inflooo.com','makeitviral.com')
$$;

create or replace function public.is_team_member()
returns boolean language sql stable set search_path = public as $$
  select auth.uid() is not null and public.is_company_email(auth.jwt() ->> 'email')
$$;

-- Block sign-ups from other domains at the auth layer
create or replace function public.enforce_company_domain()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_company_email(new.email) then
    raise exception 'Only @inflooo.com and @makeitviral.com accounts can access SaleUp';
  end if;
  return new;
end; $$;

create trigger enforce_company_domain_before_insert
before insert on auth.users for each row execute function public.enforce_company_domain();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "team reads profiles" on public.profiles for select to authenticated using (public.is_team_member());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  lead_date date,
  full_name text not null default '',
  phone text,
  lead_type text,
  budget text,
  brand_info text,
  status text not null default 'New Lead',
  deal_value numeric,
  outreached boolean not null default false,
  outreached_at timestamptz,
  outreached_by uuid,
  outreached_by_name text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_date_idx on public.leads(lead_date);
grant select, insert, update on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy "team reads leads" on public.leads for select to authenticated using (public.is_team_member());
create policy "team inserts leads" on public.leads for insert to authenticated with check (public.is_team_member());
create policy "team updates leads" on public.leads for update to authenticated using (public.is_team_member()) with check (public.is_team_member());

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid not null default auth.uid(),
  author_name text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_notes_lead_idx on public.lead_notes(lead_id);
grant select, insert, update, delete on public.lead_notes to authenticated;
grant all on public.lead_notes to service_role;
alter table public.lead_notes enable row level security;
create policy "team reads notes" on public.lead_notes for select to authenticated using (public.is_team_member());
create policy "team adds notes" on public.lead_notes for insert to authenticated with check (public.is_team_member() and author_id = auth.uid());
create policy "author edits notes" on public.lead_notes for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "author deletes notes" on public.lead_notes for delete to authenticated using (author_id = auth.uid());

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  user_name text,
  remind_at timestamptz not null,
  note text,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_user_idx on public.reminders(user_id, remind_at);
grant select, insert, update, delete on public.reminders to authenticated;
grant all on public.reminders to service_role;
alter table public.reminders enable row level security;
create policy "team reads reminders" on public.reminders for select to authenticated using (public.is_team_member());
create policy "team adds reminders" on public.reminders for insert to authenticated with check (public.is_team_member() and user_id = auth.uid());
create policy "team updates reminders" on public.reminders for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "owner deletes reminders" on public.reminders for delete to authenticated using (user_id = auth.uid());

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  user_name text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index lead_activities_created_idx on public.lead_activities(created_at desc);
grant select, insert on public.lead_activities to authenticated;
grant all on public.lead_activities to service_role;
alter table public.lead_activities enable row level security;
create policy "team reads activity" on public.lead_activities for select to authenticated using (public.is_team_member());
create policy "team logs activity" on public.lead_activities for insert to authenticated with check (public.is_team_member() and user_id = auth.uid());

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ran_by uuid default auth.uid(),
  ok boolean not null,
  imported integer not null default 0,
  total integer not null default 0,
  message text
);
grant select, insert on public.sync_runs to authenticated;
grant all on public.sync_runs to service_role;
alter table public.sync_runs enable row level security;
create policy "team reads syncs" on public.sync_runs for select to authenticated using (public.is_team_member());
create policy "team logs syncs" on public.sync_runs for insert to authenticated with check (public.is_team_member());

alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.reminders;
alter publication supabase_realtime add table public.lead_activities;
