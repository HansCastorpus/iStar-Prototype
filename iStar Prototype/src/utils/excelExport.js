import { readEditsFromData } from './analysisExport.js'

// Spreadsheet (Excel / Google Sheets) version of the analysis: one sheet per diagram with a row per element.
// Only the Text column is unlocked. The two hidden key columns tell the import which element a row is; the
// import reads nothing but the key and the text, so protection is a convenience, not what keeps the diagram safe.

const COLS = ['diagramKey', 'elementKey', 'No.', 'Type', 'Actor', 'Text']
const TEXT_COL = 6
const LINKS_SHEET = 'Links (read-only)'

// Sheet names: ≤ 31 characters, none of []:*?/\, unique, and not the links sheet's name
function sheetNamer() {
  const used = new Set([LINKS_SHEET.toLowerCase()])
  return (name) => {
    const base = (name || 'Diagram').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Diagram'
    let out = base
    for (let i = 2; used.has(out.toLowerCase()); i++) out = `${base.slice(0, 28 - String(i).length - 1)} ${i}`
    used.add(out.toLowerCase())
    return out
  }
}

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } }
const EDIT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBE6' } }

export async function buildWorkbookBlob(analysis) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const nameOf = sheetNamer()

  const styleHeader = (ws) => {
    const row = ws.getRow(1)
    row.font = { bold: true }
    row.eachCell(c => { c.fill = HEADER_FILL; c.protection = { locked: true } })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  for (const d of analysis.diagrams) {
    const ws = wb.addWorksheet(nameOf(d.name))
    ws.columns = [
      { header: COLS[0], key: 'dk', width: 10, hidden: true },
      { header: COLS[1], key: 'ek', width: 10, hidden: true },
      { header: COLS[2], key: 'no', width: 7 },
      { header: COLS[3], key: 'type', width: 12 },
      { header: COLS[4], key: 'actor', width: 24 },
      { header: COLS[5], key: 'text', width: 70, style: { alignment: { wrapText: true, vertical: 'top' } } },
    ]
    styleHeader(ws)
    for (const e of d.elements) {
      const row = ws.addRow({ dk: d.key, ek: e.key, no: e.number, type: e.type, actor: e.actor ?? '', text: e.text })
      row.eachCell(c => { c.protection = { locked: true } })
      const cell = row.getCell(TEXT_COL)
      if (e.type === 'subactor') continue  // a sub-actor's name belongs to its own diagram: stays locked
      cell.protection = { locked: false }
      cell.fill = EDIT_FILL
    }
    await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true })
  }

  const links = wb.addWorksheet(LINKS_SHEET)
  links.columns = [
    { header: 'Diagram', width: 24 }, { header: 'From No.', width: 9 }, { header: 'From text', width: 40 },
    { header: 'Link', width: 12 }, { header: 'To No.', width: 9 }, { header: 'To text', width: 40 },
  ]
  styleHeader(links)
  const label = {}
  for (const d of analysis.diagrams) {
    label[d.key] = Object.fromEntries(d.elements.map(e => [e.id, e]))
    for (const l of d.links) {
      const from = label[d.key][l.from], to = label[d.key][l.to]
      links.addRow([d.name, from?.number, from?.text, l.type, to?.number, to?.text])
    }
  }
  await links.protect('', {})

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// → same as readEdits: { nodes, links, skipped } or { error: 'notJson' | 'notAnalysis' }
// (notJson = the file could not be read as a spreadsheet)
export async function readSheetEdits(buffer, models) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(buffer) } catch { return { error: 'notJson' } }

  const diagrams = {}
  let found = false
  wb.eachSheet(ws => {
    const head = ws.getRow(1)
    if (head.getCell(1).text !== COLS[0] || head.getCell(2).text !== COLS[1]) return  // not one of our sheets
    found = true
    ws.eachRow((row, n) => {
      if (n === 1) return
      const dk = row.getCell(1).text, ek = row.getCell(2).text
      const node = models[dk]?.nodes?.[ek]
      // type is taken from the project, so nothing but the text can change
      const entry = { key: ek || undefined, type: node?.type, text: row.getCell(TEXT_COL).text }
      ;(diagrams[dk] ??= { key: dk, elements: [] }).elements.push(entry)
    })
  })
  if (!found) return { error: 'notAnalysis' }
  return readEditsFromData({ format: 'istar-analysis', diagrams: Object.values(diagrams) }, models)
}
