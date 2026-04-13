/** PostgREST: colonna `photo_urls` assente o non ancora in cache. */
export function isPhotoUrlsSchemaError(err) {
  const raw = err?.message ?? String(err)
  return /photo_urls/i.test(raw) && (/schema cache/i.test(raw) || /column/i.test(raw) || /not find/i.test(raw))
}

/** Violazione NOT NULL su sku / client_name / slot (Postgres 23502 o messaggio equivalente). */
export function isOptionalProductFieldNotNullError(err) {
  const raw = [err?.message, err?.details, err?.hint].filter(Boolean).join(' ')
  if (!/client_name|slot|sku/i.test(raw)) return false
  if (err?.code === '23502') return true
  return /not-null constraint|violates not-null|null value in column/i.test(raw)
}

/** Messaggio leggibile per insert su `products` (es. colonna mancante). */
export function formatProductsInsertError(err) {
  const raw = [err?.message, err?.details, err?.hint].filter(Boolean).join(' ') || String(err?.message ?? err)
  if (isOptionalProductFieldNotNullError(err)) {
    return [
      'Il database richiede ancora SKU, cliente o slot obbligatori.',
      'In Supabase → SQL Editor → New query: incolla ed esegui il contenuto di sql/products_optional_sku_client_slot.sql (una volta). Poi riprova a salvare.',
    ].join('\n')
  }
  if (/products_sku_format|sku_format|check constraint/i.test(raw) && /sku/i.test(raw)) {
    return 'SKU non valido: solo cifre, 1–4 caratteri, oppure lascia vuoto. Se il DB è ancora vincolato a 4 cifre fisse, esegui sql/products_optional_sku_client_slot.sql su Supabase.'
  }
  if (/products_status_check|check constraint/i.test(raw) && /status/i.test(raw) && /Eliminato/i.test(raw)) {
    return [
      'Il database Supabase non accetta ancora lo stato "Eliminato".',
      'Apri Supabase → SQL Editor → New query ed esegui il file `sql/products_add_eliminato_status.sql` del progetto.',
      'Poi riprova a eliminare l’articolo.',
    ].join('\n')
  }
  if (isPhotoUrlsSchemaError(err)) {
    return [
      'Su Supabase non esiste ancora la colonna `photo_urls` sulla tabella `products`.',
      '',
      '1) Apri il progetto → SQL Editor → New query',
      '2) Incolla ed esegui questo (una volta):',
      '',
      "alter table public.products add column if not exists photo_urls jsonb not null default '[]'::jsonb;",
      '',
      'update public.products set photo_urls = jsonb_build_array(photo_url)',
      'where photo_url is not null and jsonb_array_length(photo_urls) = 0;',
      '',
      '3) Salva di nuovo l’articolo. Se l’errore resta, attendi ~30 secondi (cache schema) o ricarica la pagina Supabase.',
      '',
      '(Stesso contenuto del file sql/product_photo_urls.sql nel progetto.)',
    ].join('\n')
  }
  return raw
}
