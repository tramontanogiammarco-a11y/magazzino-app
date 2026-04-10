const SHEETS_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbzyFfqEVnAUx4cPR5ch4YhBzoYVtTV3ys4xnq3laU0Ea06tSV5wfetxRWu31d4lduEpLg/exec'

function todayDdMmYyyy() {
  return new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatPriceEuro(price) {
  if (price == null || price === '') return ''
  const n = Number(price)
  if (Number.isNaN(n)) return ''
  return `${n} €`
}

/**
 * Notifica Google Sheets (Apps Script). no-cors: risposta opaca; errori di rete non sono leggibili.
 * Content-Type text/plain + JSON nel body: compatibile con mode no-cors (application/json spesso non lo è).
 */
export function notifyGoogleSheetsNewProduct({ description, status, price, client_name, sku, slot }) {
  const body = JSON.stringify({
    date: todayDdMmYyyy(),
    description: description ?? '',
    status: status ?? '',
    price: formatPriceEuro(price),
    client_name: client_name ?? '',
    sku: sku ?? '',
    slot: slot ?? '',
  })

  return fetch(SHEETS_WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body,
  })
}
