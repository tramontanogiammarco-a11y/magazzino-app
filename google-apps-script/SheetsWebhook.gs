/**
 * Web App (POST, chiunque). Body: JSON in e.postData.contents (text/plain dal proxy / dal browser).
 *
 * Deploy: nuova versione app web dopo ogni modifica.
 *
 * Logica:
 * - update: trova TUTTE le righe con stesso ID articolo, oppure stesso SKU+descrizione, oppure stesso SKU
 *   con id vuoto / uguale; scrive su tutte (così le copie duplicate non restano sfasate e non servono nuove righe).
 * - insert: se ID articolo è già sul foglio, aggiorna quella riga (doppio invio); altrimenti append.
 */
var ID_ARTICLE_DEFAULT_COLUMN = 10 // colonna J

function doPost(e) {
  try {
    if (!e || !e.postData) {
      return jsonOut_({ ok: false, error: 'postData mancante' })
    }
    var ep = e.parameter || {}
    var hasGs = Object.keys(ep).some(function (k) {
      return k.indexOf('gs_') === 0
    })
    if ((!e.postData.contents || !String(e.postData.contents).trim()) && !hasGs) {
      return jsonOut_({ ok: false, error: 'Body vuoto e nessun parametro gs_*' })
    }

    var data = {}
    try {
      if (e.postData.contents && String(e.postData.contents).trim()) {
        data = JSON.parse(e.postData.contents)
      }
    } catch (err) {
      return jsonOut_({ ok: false, error: 'JSON non valido: ' + String(err.message || err) })
    }
    mergeGsParameters_(data, ep)

    const sh = getSheet_()
    const lastCol = Math.max(1, sh.getLastColumn())
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    const map = buildHeaderMap_(headers)
    ensureIdColumn_(sh, map)

    const action = String(data.action || 'insert').toLowerCase()
    const productId = data.productId != null ? String(data.productId).trim() : ''
    const idCol = map.id_prodotto

    /** insert idempotente: stesso UUID già presente → aggiorna, non nuova riga */
    if (action === 'insert' && productId) {
      const dup = findRowById_(sh, idCol, productId)
      if (dup > 0) {
        writeProductRow_(sh, dup, map, data, false)
        return jsonOut_({ ok: true, mode: 'insert_dedupe', row: dup })
      }
    }

    if (action === 'update') {
      if (!productId) {
        return jsonOut_({ ok: false, error: 'update senza productId' })
      }
      const rows = findAllRowsForUpdate_(sh, map, idCol, productId, String(data.sku || ''), String(data.description || ''))
      if (rows.length > 0) {
        for (var ri = 0; ri < rows.length; ri++) {
          writeProductRow_(sh, rows[ri], map, data, false)
        }
        return jsonOut_({ ok: true, mode: 'update', rows: rows.length })
      }
      return jsonOut_({
        ok: false,
        error:
          'Nessuna riga da aggiornare (ID articolo/SKU non trovati sul foglio). Controlla colonne ID articolo e SKU.',
      })
    }

    const newRow = sh.getLastRow() + 1
    writeProductRow_(sh, newRow, map, data, true)
    return jsonOut_({ ok: true, mode: 'insert', row: newRow })
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) })
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

/** Campi inviati anche in query (?gs_status=…&gs_price=…) per script che non leggono il JSON. */
function mergeGsParameters_(data, ep) {
  if (ep.gs_action) data.action = String(ep.gs_action).toLowerCase()
  if (ep.gs_pid) data.productId = String(ep.gs_pid)
  if (ep.gs_date) data.date = String(ep.gs_date)
  if (ep.gs_status) data.status = String(ep.gs_status)
  if (ep.gs_price) data.price = String(ep.gs_price)
  if (ep.gs_sku) data.sku = String(ep.gs_sku)
  if (ep.gs_slot) data.slot = String(ep.gs_slot)
  if (ep.gs_client) data.client_name = String(ep.gs_client)
  if (ep.gs_desc) data.description = String(ep.gs_desc)
}

function getSheet_() {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('SPREADSHEET_ID')
  if (id) {
    const ss = SpreadsheetApp.openById(id)
    const name = props.getProperty('SHEET_NAME')
    if (name) return ss.getSheetByName(name) || ss.getSheets()[0]
    return ss.getSheets()[0]
  }
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
}

function normHeader_(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function buildHeaderMap_(headers) {
  const map = {}
  for (let i = 0; i < headers.length; i++) {
    const h = normHeader_(headers[i])
    if (!h) continue
    const col = i + 1
    if (
      h === 'id_prodotto' ||
      h === 'id articolo' ||
      h === 'idarticolo' ||
      h === 'product_id' ||
      h === 'productid' ||
      h === 'uuid' ||
      h === 'supabase id'
    ) {
      map.id_prodotto = col
    } else if (h === 'data' || h === 'date') map.data = col
    else if (h === 'descrizione' || h === 'titolo' || h === 'description' || h === 'articolo')
      map.descrizione = col
    else if (h === 'stato' || h === 'status') map.stato = col
    else if (h === 'prezzo' || h === 'price') map.prezzo = col
    else if (h === 'cliente' || h === 'client' || h === 'proprietario' || h === 'nome cliente') map.cliente = col
    else if (h === 'sku' || h === 'codice') map.sku = col
    else if (h === 'slot' || h === 'posizione') map.slot = col
  }

  if (!map.data) map.data = 1
  if (!map.descrizione) map.descrizione = 2
  if (!map.stato) map.stato = 3
  if (!map.prezzo) map.prezzo = 4
  if (!map.cliente) map.cliente = 5
  if (!map.sku) map.sku = 6
  if (!map.slot) map.slot = 7
  return map
}

function ensureIdColumn_(sh, map) {
  if (map.id_prodotto > 0) return
  var c = ID_ARTICLE_DEFAULT_COLUMN
  var existing = String(sh.getRange(1, c).getValue() || '').trim()
  if (existing && normHeader_(existing) !== 'id articolo' && normHeader_(existing) !== 'idarticolo') {
    c = Math.max(1, sh.getLastColumn()) + 1
  }
  sh.getRange(1, c).setValue('ID articolo')
  map.id_prodotto = c
}

function findRowById_(sh, idCol, productId) {
  if (idCol < 1 || !productId) return -1
  const last = sh.getLastRow()
  if (last < 2) return -1
  const values = sh.getRange(2, idCol, last, idCol).getValues()
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === productId) return i + 2
  }
  return -1
}

function normalizeDesc_(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function uniqueSortedRows_(arr) {
  var seen = {}
  var out = []
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i]
    if (r > 0 && !seen[r]) {
      seen[r] = 1
      out.push(r)
    }
  }
  out.sort(function (a, b) {
    return a - b
  })
  return out
}

/**
 * Tutte le righe da aggiornare: stesso UUID, oppure stesso articolo (SKU+descrizione), oppure stesso SKU con id coerente.
 * Così le copie duplicate sul foglio ricevono tutte lo stesso stato/prezzo.
 */
function findAllRowsForUpdate_(sh, map, idCol, productId, sku, description) {
  var rows = []
  var last = sh.getLastRow()
  if (last < 2) return rows

  if (idCol > 0 && productId) {
    for (var r1 = 2; r1 <= last; r1++) {
      if (String(sh.getRange(r1, idCol).getValue() || '').trim() === productId) rows.push(r1)
    }
  }
  if (rows.length > 0) return uniqueSortedRows_(rows)

  var skuDigits = String(sku || '')
    .replace(/\D/g, '')
    .trim()
  var descNorm = normalizeDesc_(description)

  if (map.sku > 0 && map.descrizione > 0 && (skuDigits || descNorm)) {
    for (var r2 = 2; r2 <= last; r2++) {
      var s2 = String(sh.getRange(r2, map.sku).getValue() || '')
        .replace(/\D/g, '')
        .trim()
      var d2 = normalizeDesc_(sh.getRange(r2, map.descrizione).getValue())
      var skuOk2 = !skuDigits || s2 === skuDigits
      var descOk2 = !descNorm || d2 === descNorm
      if (!(skuOk2 && descOk2 && (skuDigits || descNorm))) continue
      var id2 = idCol > 0 ? String(sh.getRange(r2, idCol).getValue() || '').trim() : ''
      if (!id2 || id2 === productId) rows.push(r2)
    }
  }
  if (rows.length > 0) return uniqueSortedRows_(rows)

  if (map.sku > 0 && skuDigits && idCol > 0) {
    for (var r3 = 2; r3 <= last; r3++) {
      var s3 = String(sh.getRange(r3, map.sku).getValue() || '')
        .replace(/\D/g, '')
        .trim()
      if (s3 !== skuDigits) continue
      var id3 = String(sh.getRange(r3, idCol).getValue() || '').trim()
      if (!id3 || id3 === productId) rows.push(r3)
    }
  }
  return uniqueSortedRows_(rows)
}

function writeProductRow_(sh, row, map, data, isInsert) {
  const set = (col, v) => {
    if (col > 0) sh.getRange(row, col).setValue(v)
  }
  if (isInsert && map.id_prodotto > 0 && data.productId) {
    set(map.id_prodotto, String(data.productId).trim())
  }
  set(map.data, data.date || '')
  set(map.descrizione, data.description || '')
  set(map.stato, data.status || '')
  set(map.prezzo, data.price != null ? String(data.price) : '')
  set(map.cliente, data.client_name || '')
  set(map.sku, data.sku || '')
  set(map.slot, data.slot || '')
  if (!isInsert && map.id_prodotto > 0 && data.productId) {
    set(map.id_prodotto, String(data.productId).trim())
  }
}
