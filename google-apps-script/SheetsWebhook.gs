/** Google Sheets webhook per Magazzino.
 * Colonne: A data, B descrizione, C stato, D vuota, E cliente, F SKU, G slot, I prezzo, J ID articolo.
 */
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = {};
    if (e && e.postData && e.postData.contents) data = JSON.parse(e.postData.contents || '{}');
    mergeQueryParams_(data, e && e.parameter ? e.parameter : {});

    var action = String(data.action || 'insert').toLowerCase();
    var rows = findTargetRows_(sheet, data);

    if (action === 'update') {
      if (rows.length === 0) {
        return jsonOut_({ ok: false, error: 'Riga non trovata', lookup: debugLookup_(data) });
      }
      for (var i = 0; i < rows.length; i++) updateExistingRow_(sheet, rows[i], data);
      return jsonOut_({ ok: true, mode: 'update', rows: rows, sku: data.sku || '', price: data.price || '', status: data.status || '' });
    }

    if (rows.length > 0) {
      for (var j = 0; j < rows.length; j++) updateExistingRow_(sheet, rows[j], data);
      return jsonOut_({ ok: true, mode: 'insert_dedupe', rows: rows, sku: data.sku || '', price: data.price || '', status: data.status || '' });
    }

    var row = sheet.getLastRow() + 1;
    writeFullRow_(sheet, row, data);
    return jsonOut_({ ok: true, mode: 'insert', row: row, sku: data.sku || '', price: data.price || '', status: data.status || '' });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function doGet() {
  return jsonOut_({ ok: true, message: 'Magazzino webhook attivo' });
}

function mergeQueryParams_(data, q) {
  if (q.gs_action) data.action = String(q.gs_action);
  if (q.gs_pid) data.productId = String(q.gs_pid);
  if (q.gs_date) data.date = String(q.gs_date);
  if (q.gs_status) data.status = String(q.gs_status);
  if (q.gs_price) data.price = String(q.gs_price);
  if (q.gs_sku) data.sku = String(q.gs_sku);
  if (q.gs_slot) data.slot = String(q.gs_slot);
  if (q.gs_client) data.client_name = String(q.gs_client);
  if (q.gs_desc) data.description = String(q.gs_desc);
  if (q.gs_lookup_sku) data.lookupSku = String(q.gs_lookup_sku);
  if (q.gs_lookup_client) data.lookupClient = String(q.gs_lookup_client);
  if (q.gs_lookup_slot) data.lookupSlot = String(q.gs_lookup_slot);
  if (q.gs_lookup_desc) data.lookupDescription = String(q.gs_lookup_desc);
}

function findTargetRows_(sheet, data) {
  var rows = [];
  var productId = String(data.productId || '').trim();
  var sku = normalizeSku_(data.sku);
  var lookupSku = normalizeSku_(data.lookupSku);
  var desc = normalizeText_(data.description);
  var lookupDesc = normalizeText_(data.lookupDescription);
  var clientName = normalizeText_(data.client_name);
  var lookupClient = normalizeText_(data.lookupClient);
  var slot = normalizeText_(data.slot);
  var lookupSlot = normalizeText_(data.lookupSlot);

  if (productId) rows = rows.concat(findRowsByValue_(sheet, 10, productId));
  if (rows.length === 0 && lookupSku) rows = rows.concat(findRowsBySku_(sheet, 6, lookupSku));
  if (rows.length === 0 && sku) rows = rows.concat(findRowsBySku_(sheet, 6, sku));
  if (rows.length === 0 && lookupDesc) rows = rows.concat(findRowsByText_(sheet, 2, lookupDesc));
  if (rows.length === 0 && desc) rows = rows.concat(findRowsByText_(sheet, 2, desc));
  if (rows.length === 0 && lookupClient && lookupSlot) rows = rows.concat(findRowsByClientSlot_(sheet, lookupClient, lookupSlot));
  if (rows.length === 0 && clientName && slot) rows = rows.concat(findRowsByClientSlot_(sheet, clientName, slot));

  return uniqueRows_(rows);
}

function updateExistingRow_(sheet, row, data) {
  if (data.date != null) sheet.getRange(row, 1).setValue(data.date);
  if (data.description != null) sheet.getRange(row, 2).setValue(data.description);
  if (data.status != null) {
    var statusCell = sheet.getRange(row, 3);
    statusCell.clearDataValidations();
    statusCell.setValue(String(data.status));
  }
  if (data.price != null) {
    sheet.getRange(row, 4).clearDataValidations().setValue('');
    sheet.getRange(row, 9).clearDataValidations().setValue(String(data.price));
  }
  if (data.client_name != null) sheet.getRange(row, 5).clearDataValidations().setValue(data.client_name);
  if (data.sku != null) {
    var skuCell = sheet.getRange(row, 6);
    skuCell.clearDataValidations();
    skuCell.setNumberFormat('@');
    skuCell.setValue(normalizeSku_(data.sku));
  }
  if (data.slot != null) sheet.getRange(row, 7).clearDataValidations().setValue(data.slot);
  if (data.productId != null) sheet.getRange(row, 10).clearDataValidations().setValue(data.productId);
}

function writeFullRow_(sheet, row, data) {
  sheet.getRange(row, 1).setValue(data.date || new Date().toLocaleDateString('it-IT'));
  sheet.getRange(row, 2).setValue(data.description || '');
  var statusCell = sheet.getRange(row, 3);
  statusCell.clearDataValidations();
  statusCell.setValue(data.status || '');
  sheet.getRange(row, 4).clearDataValidations().setValue('');
  sheet.getRange(row, 5).clearDataValidations().setValue(data.client_name || '');
  var skuCell = sheet.getRange(row, 6);
  skuCell.clearDataValidations();
  skuCell.setNumberFormat('@');
  skuCell.setValue(normalizeSku_(data.sku));
  sheet.getRange(row, 7).clearDataValidations().setValue(data.slot || '');
  sheet.getRange(row, 9).clearDataValidations().setValue(data.price != null ? String(data.price) : '');
  sheet.getRange(row, 10).clearDataValidations().setValue(data.productId || '');
}

function findRowsByValue_(sheet, col, value) {
  var lastRow = sheet.getLastRow();
  var rows = [];
  if (lastRow < 2 || !value) return rows;
  var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === String(value).trim()) rows.push(i + 2);
  }
  return rows;
}

function findRowsBySku_(sheet, col, sku) {
  var lastRow = sheet.getLastRow();
  var rows = [];
  if (lastRow < 2 || !sku) return rows;
  var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeSku_(values[i][0]) === sku) rows.push(i + 2);
  }
  return rows;
}

function findRowsByText_(sheet, col, text) {
  var lastRow = sheet.getLastRow();
  var rows = [];
  var needle = normalizeText_(text);
  if (lastRow < 2 || !needle) return rows;
  var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeText_(values[i][0]) === needle) rows.push(i + 2);
  }
  return rows;
}

function findRowsByClientSlot_(sheet, clientName, slot) {
  var lastRow = sheet.getLastRow();
  var rows = [];
  if (lastRow < 2) return rows;
  var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  for (var i = 0; i < values.length; i++) {
    var rowClient = normalizeText_(values[i][4]);
    var rowSlot = normalizeText_(values[i][6]);
    if (rowClient === clientName && rowSlot === slot) rows.push(i + 2);
  }
  return rows;
}

function normalizeSku_(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

function normalizeText_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqueRows_(rows) {
  var seen = {};
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = Number(rows[i]);
    if (row > 1 && !seen[row]) {
      seen[row] = true;
      out.push(row);
    }
  }
  return out;
}

function debugLookup_(data) {
  return {
    productId: data.productId || '',
    sku: data.sku || '',
    lookupSku: data.lookupSku || '',
    description: data.description || '',
    lookupDescription: data.lookupDescription || '',
    client_name: data.client_name || '',
    lookupClient: data.lookupClient || '',
    slot: data.slot || '',
    lookupSlot: data.lookupSlot || ''
  };
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
