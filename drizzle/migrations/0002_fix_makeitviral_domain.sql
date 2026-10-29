create or replace function public.is_company_email(_email text)
returns boolean language sql immutable set search_path = public as $$
  select lower(split_part(coalesce(_email,''), '@', 2)) in ('inflooo.com','makeitviral.ai')
$$;