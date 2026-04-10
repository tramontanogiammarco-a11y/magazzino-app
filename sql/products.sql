create table if not exists public.products (
  id bigint generated always as identity primary key,
  photo_url text,
  description text not null,
  sku varchar(4) not null,
  client_name text not null,
  slot text not null,
  status text not null default 'Magazzino',
  price numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  loaded_at timestamptz,
  sold_at timestamptz,
  paid_at timestamptz,
  constraint products_sku_format check (sku ~ '^[0-9]{4}$'),
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
