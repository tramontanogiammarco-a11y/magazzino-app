-- Galleria foto per articolo (stesso record prodotto)
alter table public.products
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

-- Articoli già presenti: una voce in galleria = foto principale
update public.products
set photo_urls = jsonb_build_array(photo_url)
where photo_url is not null
  and jsonb_array_length(photo_urls) = 0;
