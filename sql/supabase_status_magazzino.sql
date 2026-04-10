-- Supabase SQL Editor: allinea vincolo stato e dati a "Magazzino".
-- Nota: UPDATE deve essere prima di ADD CONSTRAINT se esistono righe con status = 'In Magazzino',
-- altrimenti il nuovo CHECK rifiuterebbe ancora quel valore.

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

UPDATE public.products SET status = 'Magazzino' WHERE status = 'In Magazzino';

ALTER TABLE public.products ADD CONSTRAINT products_status_check CHECK (
  status IN (
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
);
