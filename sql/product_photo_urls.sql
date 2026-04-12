-- Galleria foto per articolo (stesso record prodotto).
-- Esegui UNA VOLTA in Supabase: SQL Editor → incolla tutto → Run.
-- Se l’app dice ancora "schema cache", attendi ~30s o ricarica il progetto.
alter table public.products
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

-- Articoli già presenti: una voce in galleria = foto principale
update public.products
set photo_urls = jsonb_build_array(photo_url)
where photo_url is not null
  and jsonb_array_length(photo_urls) = 0;
