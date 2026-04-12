-- SKU, cliente e slot opzionali (salvataggio senza compilare tutti i campi).
-- Esegui UNA VOLTA in Supabase → SQL Editor → New query → Run.
--
-- Se vedi: «Il database richiede ancora SKU, cliente o slot obbligatori» nell’app,
-- questo script allinea il DB allo schema previsto da products.sql.

alter table if exists public.products alter column sku drop not null;
alter table if exists public.products alter column client_name drop not null;
alter table if exists public.products alter column slot drop not null;

-- Rimuove ogni CHECK su `products` che cita `sku` (anche se il vincolo non si chiama products_sku_format).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'products'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%sku%'
  loop
    execute format('alter table public.products drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table if exists public.products
  add constraint products_sku_format check (
    sku is null
    or trim(sku) = ''
    or sku ~ '^[0-9]{1,4}$'
  );
