# Relife CRM

Gestionale snello per i lead Relife Battery.

## Funzioni V1

- Inserimento lead con nome, telefono, email, citta/provincia, auto e marca, stato, note.
- Stati: No target, Conversazione, Confermato spedisce, Confermato ce la porta, Confermato Silvano, Pagato.
- Data obbligatoria quando il lead passa in uno stato confermato.
- Follow-up automatico dopo 20 giorni se un lead resta in Conversazione.
- Dashboard con totali, follow-up e batterie da seguire.
- Export CSV.

## Avvio locale

```bash
npm run dev -- --port 5174
```

Il salvataggio V1 usa `localStorage`. Il passo successivo e collegare Supabase per usare lo stesso CRM da piu dispositivi.
