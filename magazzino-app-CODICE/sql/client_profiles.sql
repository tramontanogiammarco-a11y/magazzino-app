-- Profilo anagrafico per cliente (chiave = client_name come nei prodotti)
-- Dopo l’esecuzione, se l’app vede ancora "schema cache": esegui sql/client_profiles_reload_api.sql
-- Verifica esistenza tabella: sql/client_profiles_verify.sql
create table if not exists public.client_profiles (
  client_name text primary key,
  first_name text,
  last_name text,
  phone text,
  expected_revenue numeric(12, 2),
  email text,
  iban text,
  updated_at timestamptz not null default now()
);

create or replace function public.client_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_client_profiles_updated_at on public.client_profiles;
create trigger trg_client_profiles_updated_at
before update on public.client_profiles
for each row
execute function public.client_profiles_set_updated_at();

alter table public.client_profiles enable row level security;

drop policy if exists "client_profiles_select_all" on public.client_profiles;
create policy "client_profiles_select_all"
on public.client_profiles
for select
to anon, authenticated
using (true);

drop policy if exists "client_profiles_insert_all" on public.client_profiles;
create policy "client_profiles_insert_all"
on public.client_profiles
for insert
to anon, authenticated
with check (true);

drop policy if exists "client_profiles_update_all" on public.client_profiles;
create policy "client_profiles_update_all"
on public.client_profiles
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "client_profiles_delete_all" on public.client_profiles;
create policy "client_profiles_delete_all"
on public.client_profiles
for delete
to anon, authenticated
using (true);

-- Permessi per le richieste da app (anon / authenticated via chiave pubblica)
grant select, insert, update, delete on table public.client_profiles to anon, authenticated, service_role;

-- Dopo CREATE/ALTER: ricarica la cache di PostgREST (errore "Could not find the table … in the schema cache")
notify pgrst, 'reload schema';
