import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BRAND_TIFFANY_RGB } from '../constants/brand'
import { formatDate } from '../utils/date'

/** Un solo Tiffany per barre / brand; testi neutri (zinc) */
const ACCENT = BRAND_TIFFANY_RGB
const PAGE_BG = [250, 250, 250]
const CARD_BG = [255, 255, 255]
const CARD_BORDER = [228, 228, 231]
const INK = [24, 24, 27]
const INK_MUTED = [82, 82, 91]
const INK_SOFT = [113, 113, 122]
const CHIP_BG = [255, 255, 255]
const CHIP_BORDER = [228, 228, 231]
const TABLE_HEAD = [244, 244, 245]
const ROW_ALT = [250, 250, 250]

const LOGO_FILENAME = 'Logo_TLV-removebg-preview.png'
const LOGO_MAX_W_MM = 50
const LOGO_MAX_H_MM = 18

function logoFetchUrl() {
  const base = import.meta.env.BASE_URL || '/'
  const path = `${base}${LOGO_FILENAME}`.replace(/([^:]\/)\/+/g, '$1')
  return path.startsWith('http') ? path : `${window.location.origin}${path}`
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode'))
    img.src = src
  })
}

function fitLogoMm(nw, nh, maxW, maxH) {
  if (!nw || !nh || !Number.isFinite(nw) || !Number.isFinite(nh)) {
    throw new Error('dimensioni logo non valide')
  }
  const aspect = nh / nw
  let w = maxW
  let h = w * aspect
  if (h > maxH) {
    h = maxH
    w = h / aspect
  }
  return { w: Math.round(w * 1000) / 1000, h: Math.round(h * 1000) / 1000 }
}

async function prepareLogoForPdf() {
  const res = await fetch(logoFetchUrl())
  if (!res.ok) throw new Error('logo fetch')
  const blob = await res.blob()

  let iw
  let ih
  /** @type {CanvasImageSource} */
  let source

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    iw = bitmap.width
    ih = bitmap.height
    source = bitmap
  } else {
    const dataUrl = await blobToDataUrl(blob)
    const img = await loadImageElement(dataUrl)
    iw = img.naturalWidth || img.width
    ih = img.naturalHeight || img.height
    source = img
  }

  const canvas = document.createElement('canvas')
  canvas.width = iw
  canvas.height = ih
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(source, 0, 0)
  if (typeof source.close === 'function') source.close()

  const { w: wMm, h: hMm } = fitLogoMm(iw, ih, LOGO_MAX_W_MM, LOGO_MAX_H_MM)
  return { dataUrl: canvas.toDataURL('image/png'), wMm, hMm }
}

function safeFilename(name) {
  return String(name)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim()
    .slice(0, 72) || 'cliente'
}

function drawSectionLabel(doc, label, x, y) {
  doc.setFillColor(...ACCENT)
  doc.rect(x, y - 4.2, 1.4, 6.2, 'F')
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(label, x + 5, y)
}

export async function exportClientPdf({ clientName, items, toPay }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const m = 16
  const contentW = pageW - 2 * m

  doc.setFillColor(...PAGE_BG)
  doc.rect(0, 0, pageW, pageH, 'F')

  const nTot = items.length
  const nMag = items.filter((i) => i.status === 'Magazzino').length
  const nCar = items.filter((i) => i.status === 'Caricato').length
  const nVen = items.filter((i) => i.status === 'Venduto').length
  const nPag = items.filter((i) => i.status === 'Pagato').length
  const nOther = nTot - nMag - nCar - nVen - nPag

  const headerCardH = 34
  const headerY = m

  doc.setFillColor(...CARD_BG)
  doc.setDrawColor(...CARD_BORDER)
  doc.setLineWidth(0.25)
  doc.roundedRect(m, headerY, contentW, headerCardH, 3.5, 3.5, 'FD')
  doc.setFillColor(...ACCENT)
  doc.roundedRect(m, headerY, 3.2, headerCardH, 2, 2, 'F')

  try {
    const { dataUrl, wMm: lw, hMm: lh } = await prepareLogoForPdf()
    const logoX = m + 7
    const logoY = headerY + headerCardH / 2 - lh / 2
    doc.addImage(dataUrl, 'PNG', logoX, logoY, lw, lh)
  } catch {
    doc.setTextColor(...ACCENT)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Telovendo', m + 7, headerY + 16)
  }

  const textRight = pageW - m - 5
  doc.setTextColor(...ACCENT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('TELOVENDO', textRight, headerY + 10, { align: 'right' })
  doc.setTextColor(...INK)
  doc.setFontSize(15)
  doc.text('Magazzino', textRight, headerY + 18, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...INK_SOFT)
  doc.setFontSize(9.5)
  doc.text('Report cliente · PDF', textRight, headerY + 27, { align: 'right' })

  let y = headerY + headerCardH + 12

  doc.setTextColor(...ACCENT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('CLIENTE', m, y)
  y += 12
  doc.setTextColor(...INK)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  const nameLines = doc.splitTextToSize(clientName, contentW)
  doc.text(nameLines, m, y)
  y += nameLines.length * 9.5 + 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...INK_MUTED)
  doc.text(
    `Generato ${new Date().toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}`,
    m,
    y,
  )
  y += 13

  drawSectionLabel(doc, 'Articoli', m, y)
  y += 9

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Descrizione', 'Stato', 'Prezzo', 'Creato']],
    body: items.map((item) => [
      String(item.sku ?? ''),
      String(item.description ?? ''),
      String(item.status ?? ''),
      `EUR ${Number(item.price || 0).toFixed(2)}`,
      formatDate(item.created_at),
    ]),
    theme: 'plain',
    headStyles: {
      fillColor: TABLE_HEAD,
      textColor: INK,
      fontStyle: 'bold',
      fontSize: 10,
      lineColor: CHIP_BORDER,
      lineWidth: 0,
    },
    styles: {
      fontSize: 10,
      textColor: INK,
      cellPadding: { top: 4.2, bottom: 4.2, left: 3.5, right: 3.5 },
      lineColor: [228, 228, 231],
      lineWidth: 0.12,
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28 },
      3: { cellWidth: 27 },
      4: { cellWidth: 30 },
    },
    margin: { left: m, right: m, bottom: 18 },
    tableLineWidth: 0,
    showFoot: 'never',
  })

  y = doc.lastAutoTable.finalY + 12

  const payCardH = 18
  doc.setFillColor(...ROW_ALT)
  doc.setDrawColor(...CHIP_BORDER)
  doc.roundedRect(m, y, contentW, payCardH, 3, 3, 'FD')
  doc.setFillColor(...ACCENT)
  doc.rect(m, y, 3, payCardH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...INK)
  doc.text(`Totale da pagare (Venduto) · EUR ${Number(toPay).toFixed(2)}`, m + 8, y + 11.5)

  y += payCardH + 8

  const statCardExtra = nOther > 0 ? 10 : 0
  const statCardH = 50 + statCardExtra
  doc.setFillColor(...CARD_BG)
  doc.setDrawColor(...CARD_BORDER)
  doc.roundedRect(m, y, contentW, statCardH, 3.5, 3.5, 'FD')

  drawSectionLabel(doc, 'Statistiche', m + 5, y + 10)

  const pairs = [
    [nTot, 'Articoli'],
    [nMag, 'Magazzino'],
    [nCar, 'Caricato'],
    [nVen, 'Venduto'],
    [nPag, 'Pagato'],
  ]
  const gap = 2.2
  const innerPad = 5
  const rowTop = y + 17
  const chipH = 25
  const chipW = (contentW - 2 * innerPad - 4 * gap) / 5

  for (let i = 0; i < 5; i++) {
    const cx = m + innerPad + i * (chipW + gap)
    doc.setFillColor(...CHIP_BG)
    doc.setDrawColor(...CHIP_BORDER)
    doc.setLineWidth(0.2)
    doc.roundedRect(cx, rowTop, chipW, chipH, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...INK)
    doc.text(String(pairs[i][0]), cx + chipW / 2, rowTop + 11, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...INK_SOFT)
    doc.text(pairs[i][1], cx + chipW / 2, rowTop + 19, { align: 'center' })
  }

  if (nOther > 0) {
    doc.setFontSize(9)
    doc.setTextColor(...INK_MUTED)
    doc.text(`Altri stati: ${nOther} articoli`, m + 5, y + statCardH - 6)
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8.5)
    doc.setTextColor(...INK_SOFT)
    doc.setFont('helvetica', 'normal')
    doc.text('Telovendo · Magazzino', pageW / 2, pageH - 8, { align: 'center' })
    doc.setTextColor(161, 161, 170)
    doc.text(`${i} / ${totalPages}`, pageW - m, pageH - 8, { align: 'right' })
  }

  doc.save(`riepilogo-${safeFilename(clientName)}.pdf`)
}
