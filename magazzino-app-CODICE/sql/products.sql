create table if not exists public.products (
  id bigint generated always as identity primary key,
  photo_url text,
  photo_urls jsonb not null default '[]'::jsonb,
  description text not null,
  sku varchar(4),
  client_name text,
  slot text,
  status text not null default 'Magazzino',
  price numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  loaded_at timestamptz,
  sold_at timestamptz,
  paid_at timestamptz,
  constraint products_sku_format check (sku is null or trim(sku) = '' or sku ~ '^[0-9]{1,4}$'),
  constraint products_status_check check (
    status in (
      'Magazzino',
      'Caricato',
      'Venduto',
      'Pagato',
      'Spedito',
      'Reso',
      'Da Buttare',
      'Abbassa di Prezzo',
      'Beneficienza',
      'Ridato al Cliente'
    )
  )
);

-- Tabella già esistente (schema vecchio): aggiunge galleria senza ricreare la tabella
alter table public.products
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

update public.products
set photo_urls = jsonb_build_array(photo_url)
where photo_url is not null
  and jsonb_array_length(photo_urls) = 0;

-- DB già creato senza queste modifiche: vedi anche sql/products_optional_sku_client_slot.sql
alter table public.products alter column sku drop not null;
alter table public.products alter column client_name drop not null;
alter table public.products alter column slot drop not null;
alter table public.products drop constraint if exists products_sku_format;
alter table public.products
  add constraint products_sku_format check (sku is null or trim(sku) = '' or sku ~ '^[0-9]{1,4}$');

create or replace function public.set_loaded_at_on_caricato()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Caricato' and old.status is distinct from 'Caricato' and new.loaded_at is null then
    new.loaded_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_loaded_at on public.products;
create trigger trg_products_loaded_at
before update on public.products
for each row
execute function public.set_loaded_at_on_caricato();

-- RLS on table
alter table public.products enable row level security;

-- Demo policies (public anon/auth). Per produzione valuta policy per utente/ruolo.
drop policy if exists "products_select_all" on public.products;
create policy "products_select_all"
on public.products
for select
to anon, authenticated
using (true);

drop policy if exists "products_insert_all" on public.products;
create policy "products_insert_all"
on public.products
for insert
to anon, authenticated
with check (true);

drop policy if exists "products_update_all" on public.products;
create policy "products_update_all"
on public.products
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "products_delete_all" on public.products;
create policy "products_delete_all"
on public.products
for delete
to anon, authenticated
using (true);

-- bucket storage pubblico per foto
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

-- storage policies per bucket products
drop policy if exists "storage_products_public_read" on storage.objects;
create policy "storage_products_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'products');

drop policy if exists "storage_products_public_insert" on storage.objects;
create policy "storage_products_public_insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'products');

drop policy if exists "storage_products_public_update" on storage.objects;
create policy "storage_products_public_update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'products')
with check (bucket_id = 'products');

drop policy if exists "storage_products_public_delete" on storage.objects;
create policy "storage_products_public_delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'products');
