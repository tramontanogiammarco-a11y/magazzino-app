# Magazzino Vestiti Usati

Applicazione React per gestione capi usati con:

- Upload foto + analisi AI per titolo e descrizione
- Persistenza su Supabase (`products` + bucket storage `products`)
- Inventario con filtri, stato, prezzo/note editabili e badge scadenza
- Pagina Clienti con totale da pagare ed export PDF
- Dashboard statistiche
- Sync opzionale verso Google Sheets

## Setup Base

1. Installa dipendenze:

```bash
npm install
```

2. Crea `.env` partendo da `.env.example`.

3. In Supabase SQL Editor esegui `sql/products.sql`.

4. Avvia il progetto:

```bash
npm run dev
```

## Google Sheets: modalità consigliata

Per evitare righe duplicate quando cambi stato / SKU / cliente, usa la modalità `Google Sheets API` invece del vecchio webhook Apps Script.

### 1. Crea un service account Google

In Google Cloud:

1. Vai su `IAM e amministrazione` → `Account di servizio`
2. Crea un nuovo service account
3. Aprilo e genera una chiave JSON
4. Salva il file JSON sul Mac, per esempio:

```bash
/Users/galluse/Desktop/google-service-account.json
```

### 2. Condividi il foglio con il service account

Apri il file JSON e prendi `client_email`, qualcosa tipo:

```text
magazzino-sync@tuo-progetto.iam.gserviceaccount.com
```

Poi apri Google Sheets e condividi il foglio con quell’email come `Editor`.

### 3. Aggiungi le variabili al `.env`

```env
GOOGLE_SHEETS_SPREADSHEET_ID=incolla-qui-l-id-del-foglio
GOOGLE_SHEETS_TAB=Foglio1
GOOGLE_APPLICATION_CREDENTIALS=/Users/galluse/Desktop/google-service-account.json
```

L’ID del foglio è la parte dell’URL tra `/d/` e `/edit`.

### 4. Riavvia il progetto

```bash
npm run dev
```

### 5. Verifica veloce

Apri:

```text
http://localhost:3001/api/health
```

Se vedi:

```json
"sheetsSync": "google_sheets_api"
```

allora gli aggiornamenti da inventario useranno la stessa riga del foglio.

## Nota attuale

Finché `Google Sheets API` non è configurata:

- i nuovi prodotti continuano a essere inseriti nel foglio
- gli aggiornamenti inventario non vengono più inviati a Google, per evitare duplicati

## Regole business

- Cambio stato a `Caricato` => valorizza `loaded_at`
- Solo stato `Venduto` contribuisce al totale da dare al cliente
- Stato `Pagato` non va nel totale da pagare
- `price` e `notes` sono modificabili da inventario
