// The contributors' spreadsheet. The designer exports it from the graph; contributors fill it in (one row per
// element: type, actor, text, relations, positive and negative aspects, connected actors); the designer imports it
// and the new rows land in the inbox. Links are never part of it.
//
// A hidden sheet holds a snapshot of every editable row as exported. On import it is the common ancestor of a
// three-way merge: a field only changes if the contributor changed it, and a contributor's change to a field
// that was also changed in the app since the export is reported as a conflict instead of overwriting it.

export const ELEMENT_TYPES = ['goal', 'task', 'softgoal', 'resource']

const SHEET = 'Elements'
const LISTS = 'Lists'
const SNAPSHOT = '_snapshot'
const BLANK_ROWS = 200
const MIN_CONNECTED = 3
const CHUNK = 30000
const FIXED = ['Key', 'Status', 'No.', 'Type', 'Actor', 'Text', 'Relation type', 'Relations', 'Positive aspects', 'Negative aspects']
const COL = { key: 1, status: 2, num: 3, type: 4, actor: 5, text: 6, relationType: 7, relations: 8, positive: 9, negative: 10, connected: 11 }

// Greys only. White cells are the essential ones (type, actor, text), light grey the optional extras; the darker grey
// cells (status, number, rows already on the graph) are not for filling in. Every cell has a thin border.
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const HEAD_ESSENTIAL = fill('FF7F7F7F'), HEAD_EXTRA = fill('FFD0D0D0'), HEAD_INFO = fill('FFE3E3E3')
const ESSENTIAL_FILL = fill('FFFFFFFF'), EXTRA_FILL = fill('FFEDEDED'), INFO_FILL = fill('FFCFCFCF')
const SIDE = { style: 'thin', color: { argb: 'FF8C8C8C' } }
const BORDER = { top: SIDE, left: SIDE, bottom: SIDE, right: SIDE }
const HEADER_ROW = 2  // row 1 holds the rules, row 2 the column headings (and the filter), the elements start on row 3
const ESSENTIAL = ['type', 'actor', 'text']

const HINTS = {
  info: 'Filled in for you. Numbers can change, so do not rely on them. Do not insert, delete or sort rows.',
  type: 'Goal, task, softgoal or resource. Pick from the list.',
  actor: 'Who this element belongs to. Pick from the list; if yours is missing, type its name.',
  text: 'A short summary of the element.',
  relationType: 'The kind of relation it has with other elements. Pick from the list.',
  relations: 'How it relates to other elements, and which ones, in your own words.',
  positive: 'What it helps or improves.',
  negative: 'What it harms, costs or puts at risk.',
  connected: 'Another actor this element is connected to. Pick from the list.',
}

const FIELDS = ['type', 'text', 'actorName', 'relationType', 'relations', 'positive', 'negative', 'connected']
const clean = (v) => (v ?? '').toString().trim()
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '')

// The editable part of an inbox item (the same shape is stored in the snapshot)
export const fieldsOf = (item) => ({
  type: item.type ?? 'goal', text: item.text ?? '', actorName: item.actorName ?? '', relationType: item.relationType ?? '',
  relations: item.relations ?? '', positive: item.positive ?? '', negative: item.negative ?? '',
  connected: item.connected ?? [],
})

// data: { modelName, actorNames, linkTypes: [{ id, label }], items: [{ id, placed, ...fields }], graphRows: [{ key, type, actorName, text, diagram }] }
export async function buildInboxWorkbookBlob(data) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const connectedCols = Math.max(MIN_CONNECTED, ...data.items.map(i => i.connected?.length ?? 0))
  const lastCol = COL.connected + connectedCols - 1

  // Lists feeding the drop-downs
  const lists = wb.addWorksheet(LISTS, { state: 'hidden' })
  ELEMENT_TYPES.forEach((t, i) => { lists.getCell(i + 1, 1).value = t })
  data.actorNames.forEach((n, i) => { lists.getCell(i + 1, 2).value = n })
  data.linkTypes.forEach((l, i) => { lists.getCell(i + 1, 3).value = l.label })
  const labelOf = Object.fromEntries(data.linkTypes.map(l => [l.id, l.label]))

  const ws = wb.addWorksheet(SHEET)
  const widths = [10, 16, 7, 12, 24, 50, 16, 40, 32, 32]
  const headers = [...FIXED, ...Array.from({ length: connectedCols }, (_, i) => `Connected actor ${i + 1}`)]
  ws.columns = headers.map((_, i) => ({ width: widths[i] ?? 24, hidden: i === 0, style: { alignment: { wrapText: true, vertical: 'top' } } }))

  // Row 1: the rules, one cell above each column (Status and No. share one). Essential columns first say so, then what to put in.
  const essentialAt = new Set(ESSENTIAL.map(k => COL[k]))
  const ruleOf = (c) => c < COL.type ? ['INFO ONLY', HINTS.info]
    : essentialAt.has(c) ? ['ESSENTIAL', HINTS[Object.keys(COL).find(k => COL[k] === c)]]
    : ['OPTIONAL', HINTS[Object.keys(COL).find(k => COL[k] === c) ?? 'connected']]
  ws.mergeCells(1, COL.status, 1, COL.num)
  let ruleLines = 1
  for (let c = COL.status; c <= lastCol; c++) {
    if (c === COL.num) continue
    const [label, text] = ruleOf(c)
    const cell = ws.getCell(1, c)
    cell.value = { richText: [{ font: { bold: true, size: 10 }, text: label }, { font: { size: 10 }, text: `\n${text}` }] }
    cell.alignment = { wrapText: true, vertical: 'top' }
    const width = c === COL.status ? widths[1] + widths[2] : widths[c - 1] ?? 24
    ruleLines = Math.max(ruleLines, 1 + Math.ceil(text.length / (width * 0.9)))  // a little under a character per width unit, so the text is never cut off
  }
  ws.getRow(1).height = ruleLines * 14 + 8

  // Row 2: the headings, with the filter
  headers.forEach((h, i) => {
    const c = i + 1, cell = ws.getCell(HEADER_ROW, c)
    cell.value = h
    cell.font = essentialAt.has(c) ? { bold: true, color: { argb: 'FFFFFFFF' } } : { bold: true }
    cell.fill = c < COL.type ? HEAD_INFO : essentialAt.has(c) ? HEAD_ESSENTIAL : HEAD_EXTRA
  })
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }]
  const head = ws.getRow(HEADER_ROW)
  const noteOf = { [COL.type]: HINTS.type, [COL.actor]: HINTS.actor, [COL.text]: HINTS.text, [COL.relationType]: HINTS.relationType, [COL.relations]: HINTS.relations, [COL.positive]: HINTS.positive, [COL.negative]: HINTS.negative }
  for (let c = COL.connected; c <= lastCol; c++) noteOf[c] = HINTS.connected
  for (const [c, note] of Object.entries(noteOf)) head.getCell(Number(c)).note = note

  const base = {}
  for (const item of data.items) {
    const f = fieldsOf(item)
    base[item.id] = f
    ws.addRow([item.id, item.placed ? 'On graph' : 'In inbox', item.num, f.type, f.actorName, f.text, labelOf[f.relationType] ?? '', f.relations, f.positive, f.negative, ...f.connected])
  }
  for (const g of data.graphRows) ws.addRow([`node:${g.key}`, `On graph${g.diagram ? ` · ${g.diagram}` : ''}`, g.num, g.type, g.actorName, g.text])
  for (let i = 0; i < BLANK_ROWS; i++) ws.addRow([])

  // Colours, locking and drop-downs row by row. The actor drop-downs only warn on an unknown name, so a new actor can still be typed.
  const total = ws.rowCount
  const actorList = data.actorNames.length && { type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Unknown actor',
    error: 'This actor is not on the list. Keep it anyway?', formulae: [`${LISTS}!$B$1:$B$${data.actorNames.length}`] }
  for (let r = HEADER_ROW + 1; r <= total; r++) {
    const row = ws.getRow(r)
    const onGraph = String(row.getCell(COL.key).value ?? '').startsWith('node:')
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c)
      const open = !onGraph && c >= COL.type
      cell.protection = { locked: !open }
      cell.fill = !open ? INFO_FILL : essentialAt.has(c) ? ESSENTIAL_FILL : EXTRA_FILL
      if (onGraph) cell.font = { color: { argb: 'FF595959' } }
    }
    if (onGraph) continue
    row.getCell(COL.type).dataValidation = { type: 'list', allowBlank: true, formulae: [`${LISTS}!$A$1:$A$${ELEMENT_TYPES.length}`] }
    if (data.linkTypes.length) row.getCell(COL.relationType).dataValidation = { type: 'list', allowBlank: true, formulae: [`${LISTS}!$C$1:$C$${data.linkTypes.length}`] }
    if (!actorList) continue
    row.getCell(COL.actor).dataValidation = actorList
    for (let c = COL.connected; c <= lastCol; c++) row.getCell(c).dataValidation = actorList
  }
  for (let c = COL.status; c <= lastCol; c++) ws.getCell(1, c).fill = c < COL.type ? HEAD_INFO : essentialAt.has(c) ? ESSENTIAL_FILL : EXTRA_FILL
  ws.eachRow({ includeEmpty: true }, row => { for (let c = 1; c <= lastCol; c++) row.getCell(c).border = BORDER })
  ws.autoFilter = { from: { row: HEADER_ROW, column: COL.status }, to: { row: total, column: lastCol } }
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, autoFilter: true })

  // Snapshot of the editable rows as exported (very hidden: not even in the "Unhide" list)
  const snap = wb.addWorksheet(SNAPSHOT, { state: 'veryHidden' })
  const json = JSON.stringify({ format: 'istar-inbox', version: 1, exportedAt: new Date().toISOString(), rows: base })
  for (let i = 0, r = 1; i < json.length; i += CHUNK, r++) snap.getCell(r, 1).value = json.slice(i, i + CHUNK)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// → { rows: [{ line, key, ...fields }], base } or { error: 'notJson' | 'notInbox' }
// labelMap: lower-case link type names (any language) and ids → id
export async function readInboxWorkbook(buffer, labelMap = {}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(buffer) } catch { return { error: 'notJson' } }
  const ws = wb.getWorksheet(SHEET)
  if (!ws) return { error: 'notInbox' }
  // Columns are found by their header, so sheets from earlier versions of the template (with other columns) still load
  const at = { connected: [] }
  // The headings are on row 2 (row 1 holds the rules); sheets from earlier versions have them on row 1
  let headerLine = 0
  for (let r = 1; r <= 5 && !headerLine; r++) {
    const texts = []
    for (let c = 1; c <= ws.columnCount; c++) texts.push(clean(ws.getRow(r).getCell(c).text).toLowerCase())
    if (texts.includes('key') && texts.includes('text')) headerLine = r
  }
  if (!headerLine) return { error: 'notInbox' }
  const headerRow = ws.getRow(headerLine)
  for (let c = 1; c <= ws.columnCount; c++) {
    const h = clean(headerRow.getCell(c).text).toLowerCase()
    if (h === 'key') at.key = c
    else if (h === 'type') at.type = c
    else if (h === 'actor') at.actor = c
    else if (h === 'text') at.text = c
    else if (h === 'relation type') at.relationType = c
    else if (h === 'relations') at.relations = c
    else if (h === 'positive aspects') at.positive = c
    else if (h === 'negative aspects') at.negative = c
    else if (h.startsWith('connected actor')) at.connected.push(c)
  }
  if (!at.key || !at.text) return { error: 'notInbox' }
  const cell = (row, c) => (c ? clean(row.getCell(c).text) : '')

  let base = {}
  const snap = wb.getWorksheet(SNAPSHOT)
  if (snap) {
    let json = ''
    snap.eachRow(row => { json += row.getCell(1).text })
    try { base = JSON.parse(json).rows ?? {} } catch { base = {} }
  }

  const relationOf = (text) => text ? labelMap[text.toLowerCase()] ?? `!${text}` : ''  // '!…': not a link type
  const rows = []
  ws.eachRow((row, line) => {
    if (line <= headerLine) return
    const connected = []
    for (const c of at.connected) { const v = cell(row, c); if (v && !connected.includes(v)) connected.push(v) }
    rows.push({
      line, key: cell(row, at.key),
      type: cell(row, at.type).toLowerCase(), actorName: cell(row, at.actor), text: cell(row, at.text),
      relationType: relationOf(cell(row, at.relationType)), relations: cell(row, at.relations), positive: cell(row, at.positive), negative: cell(row, at.negative),
      connected,
    })
  })
  return { rows, base }
}

// Works out what an import would do, changing nothing.
//   rows, base: from readInboxWorkbook   items: the inbox now   mineOf(item): its fields now (a placed element's text is the one on the graph)
// → { adds: [fields], updates: [{ id, patch }], conflicts: [{ id, field, mine, theirs }], errors: [{ line, reason }], removed, unlisted }
export function planInboxImport({ rows, base, items, mineOf, actorNames }) {
  const plan = { adds: [], updates: [], conflicts: [], errors: [], removed: 0, unlisted: [] }
  const unlisted = new Set()
  const noteActors = (f) => { for (const n of [f.actorName, ...f.connected]) if (n && !actorNames.includes(n)) unlisted.add(n) }
  const problem = (f) => !f.text ? 'missingText' : !ELEMENT_TYPES.includes(f.type) ? 'badType' : f.relationType?.startsWith('!') ? 'badRelation' : null

  for (const row of rows) {
    if (row.key.startsWith('node:')) continue  // on the graph already: shown for context only
    const theirs = fieldsOf(row)
    if (!row.key) {
      if (FIELDS.every(k => k === 'type' || !theirs[k] || !theirs[k].length)) continue  // an empty row
      const reason = problem(theirs)
      if (reason) plan.errors.push({ line: row.line, reason }); else { plan.adds.push(theirs); noteActors(theirs) }
      continue
    }
    const item = items.find(i => i.id === row.key)
    if (!item) { if (base[row.key]) plan.removed++; else plan.errors.push({ line: row.line, reason: 'unknownKey' }); continue }
    const mine = mineOf(item)
    const was = base[row.key] ?? mine  // no snapshot: the sheet wins
    const patch = {}
    for (const field of FIELDS) {
      if (same(theirs[field], was[field])) continue  // the contributor left it alone
      if (same(mine[field], was[field]) || same(mine[field], theirs[field])) patch[field] = theirs[field]
      else plan.conflicts.push({ id: item.id, line: row.line, field, mine: mine[field], theirs: theirs[field] })
    }
    const reason = Object.keys(patch).length && problem({ ...mine, ...patch })
    if (reason) { plan.errors.push({ line: row.line, reason }); continue }
    if (Object.keys(patch).length) { plan.updates.push({ id: item.id, patch }); noteActors({ ...mine, ...patch }) }
  }
  plan.unlisted = [...unlisted]
  return plan
}
