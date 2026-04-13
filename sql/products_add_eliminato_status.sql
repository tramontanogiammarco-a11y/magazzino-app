-- Supabase SQL Editor: abilita lo stato "Eliminato" nel vincolo products_status_check.

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE public.products ADD CONSTRAINT products_status_check CHECK (
  status IN (
    'Magazzino',
    'Caricato',
    'Venduto',
    'Pagato',
    'Reso',
    'Da Buttare',
    'Abbassa di Prezzo',
    'Beneficienza',
    'Ridato al Cliente',
    'Eliminato'
  )
);
