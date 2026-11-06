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
const README = 'Read me'
const BLANK_ROWS = 200
const MIN_CONNECTED = 3
const CHUNK = 30000
const FIXED = ['Key', 'Status', 'No.', 'Type', 'Actor', 'Text', 'Relation type', 'Relations', 'Positive aspects', 'Negative aspects']
const COL = { key: 1, status: 2, num: 3, type: 4, actor: 5, text: 6, relationType: 7, relations: 8, positive: 9, negative: 10, connected: 11 }

// Greys only: dark header, white cells to fill in, light grey rows that are shown for information. Every cell has a thin border.
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
const EDIT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
const INFO_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
const SIDE = { style: 'thin', color: { argb: 'FF8C8C8C' } }
const BORDER = { top: SIDE, left: SIDE, bottom: SIDE, right: SIDE }

const HINTS = {
  type: 'Goal, task, softgoal or resource.',
  actor: 'Who this element belongs to. Pick from the list.',
  text: 'The element itself, as short as you can make it.',
  relationType: 'The kind of relation it has with the others. Pick from the list; explain it in Relations.',
  relations: 'How does it relate to other elements, and which ones?',
  positive: 'What does it help or improve?',
  negative: 'What does it harm, cost or put at risk?',
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

  const readme = wb.addWorksheet(README)
  readme.getColumn(1).width = 110
  ;[
    `${data.modelName || 'Model'} — elements`,
    '',
    'Fill in one row per element, in the "Elements" sheet. The white, bordered cells are yours to fill; grey rows are already on the graph and are only shown for context.',
    'Type and Actor have a drop-down. If the actor you need is missing, type its name: the designer will add it.',
    'Relations, positive and negative aspects are free text. Say in your own words how it relates to others; the designer draws the links.',
    'Connected actors tell the designer where to place this actor in relation to the others.',
    'The numbers are for reference (to talk about an element). They can change when elements are added to the graph, so do not rely on them. New rows get a number when the designer imports them.',
    'Do not insert, delete or sort rows, and leave the hidden columns alone.',
  ].forEach((line, i) => { readme.getCell(i + 1, 1).value = line; readme.getCell(i + 1, 1).alignment = { wrapText: true, vertical: 'top' } })
  readme.getCell(1, 1).font = { bold: true, size: 14 }

  // Lists feeding the drop-downs
  const lists = wb.addWorksheet(LISTS, { state: 'hidden' })
  ELEMENT_TYPES.forEach((t, i) => { lists.getCell(i + 1, 1).value = t })
  data.actorNames.forEach((n, i) => { lists.getCell(i + 1, 2).value = n })
  data.linkTypes.forEach((l, i) => { lists.getCell(i + 1, 3).value = l.label })
  const labelOf = Object.fromEntries(data.linkTypes.map(l => [l.id, l.label]))

  const ws = wb.addWorksheet(SHEET)
  const widths = [10, 16, 7, 12, 24, 50, 16, 40, 32, 32]
  const headers = [...FIXED, ...Array.from({ length: connectedCols }, (_, i) => `Connected actor ${i + 1}`)]
  ws.columns = headers.map((header, i) => ({ header, width: widths[i] ?? 24, hidden: i === 0, style: { alignment: { wrapText: true, vertical: 'top' } } }))
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.eachCell(c => { c.fill = HEADER_FILL; c.protection = { locked: true } })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const noteOf = { [COL.type]: HINTS.type, [COL.actor]: HINTS.actor, [COL.text]: HINTS.text, [COL.relationType]: HINTS.relationType, [COL.relations]: HINTS.relations, [COL.positive]: HINTS.positive, [COL.negative]: HINTS.negative }
  for (let c = COL.connected; c <= lastCol; c++) noteOf[c] = HINTS.connected
  for (const [c, note] of Object.entries(noteOf)) head.getCell(Number(c)).note = note

  const base = {}
  const editable = (row) => { for (let c = COL.type; c <= lastCol; c++) { const cell = row.getCell(c); cell.protection = { locked: false }; cell.fill = EDIT_FILL } }

  for (const item of data.items) {
    const f = fieldsOf(item)
    base[item.id] = f
    const values = [item.id, item.placed ? 'On graph' : 'In inbox', item.num, f.type, f.actorName, f.text, labelOf[f.relationType] ?? '', f.relations, f.positive, f.negative, ...f.connected]
    const row = ws.addRow(values)
    row.eachCell({ includeEmpty: true }, c => { c.protection = { locked: true } })
    editable(row)
  }
  for (const g of data.graphRows) {
    const row = ws.addRow([`node:${g.key}`, `On graph${g.diagram ? ` · ${g.diagram}` : ''}`, g.num, g.type, g.actorName, g.text])
    row.eachCell({ includeEmpty: true }, c => { c.protection = { locked: true }; c.fill = INFO_FILL })
  }
  for (let i = 0; i < BLANK_ROWS; i++) {
    const row = ws.addRow([])
    for (let c = 1; c <= lastCol; c++) row.getCell(c).protection = { locked: c === COL.key || c === COL.status }
    editable(row)
    for (const c of [COL.status, COL.num]) row.getCell(c).fill = INFO_FILL  // locked: not for filling in
  }

  // Drop-downs on every editable row. The actor ones only warn on an unknown name, so a new actor can still be typed.
  const total = ws.rowCount
  const first = 2 + 0
  for (let r = first; r <= total; r++) {
    if (String(ws.getCell(r, COL.key).value ?? '').startsWith('node:')) continue
    ws.getCell(r, COL.type).dataValidation = { type: 'list', allowBlank: true, formulae: [`${LISTS}!$A$1:$A$${ELEMENT_TYPES.length}`] }
    if (data.linkTypes.length) ws.getCell(r, COL.relationType).dataValidation = { type: 'list', allowBlank: true, formulae: [`${LISTS}!$C$1:$C$${data.linkTypes.length}`] }
    if (!data.actorNames.length) continue
    const actorList = { type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Unknown actor',
      error: 'This actor is not on the list. Keep it anyway?', formulae: [`${LISTS}!$B$1:$B$${data.actorNames.length}`] }
    ws.getCell(r, COL.actor).dataValidation = actorList
    for (let c = COL.connected; c <= lastCol; c++) ws.getCell(r, c).dataValidation = actorList
  }
  ws.eachRow({ includeEmpty: true }, row => { for (let c = 1; c <= lastCol; c++) row.getCell(c).border = BORDER })
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true })

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
  const headerRow = ws.getRow(1)
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
    if (line === 1) return
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
