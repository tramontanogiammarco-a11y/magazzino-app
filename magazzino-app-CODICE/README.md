# Magazzino Vestiti Usati

Applicazione React per gestione capi usati con:

- Upload foto + estrazione automatica dati con Gemini Vision (`gemini-1.5-flash`)
- Persistenza su Supabase (`products` + bucket storage `products`)
- Inventario con filtri, stato, prezzo/note editabili e badge scadenza 30 giorni
- Pagina Clienti con totale da pagare (solo articoli `Venduto`) + export PDF
- Dashboard statistiche con KPI e grafico ricavi mensili
- Dark mode toggle

## Setup

1. Installa dipendenze:

```bash
npm install
```

2. Crea `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_KEY=...
VITE_GEMINI_API_KEY=...
```

3. In Supabase SQL Editor esegui `sql/products.sql`.

4. Avvia il progetto:

```bash
npm run dev
```

## Note regole business

- Cambio stato a `Caricato` => valorizza `loaded_at`.
- Solo stato `Venduto` contribuisce al totale da dare al cliente.
- Stato `Pagato` non va nel totale da pagare.
- `price` e `notes` sono modificabili da inventario.
