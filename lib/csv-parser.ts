// ============================================================
// SA Bank CSV Parser
// Handles export formats from Standard Bank, FNB, Absa,
// Nedbank, Capitec, Investec, Discovery, TymeBank
// ============================================================

import Papa from 'papaparse'

export interface ParsedTransaction {
  date:        string   // ISO format YYYY-MM-DD
  description: string
  amount:      number   // positive = credit (income), negative = debit (expense)
  balance:     number | null
  reference:   string | null
}

export interface ParseResult {
  transactions: ParsedTransaction[]
  errors:       string[]
  bank:         string | null
}

export function parseBankCSV(csvText: string): ParseResult {
  const result = Papa.parse<string[]>(csvText.trim(), {
    skipEmptyLines: true,
    header: false,
  })

  const rows = result.data as string[][]
  if (rows.length < 2) {
    return { transactions: [], errors: ['File appears to be empty or invalid'], bank: null }
  }

  // Detect bank format by header row patterns
  const headerRow = rows[0].map((h) => h.toLowerCase().trim())
  const detected  = detectBankFormat(headerRow)

  if (!detected) {
    // Try generic detection
    return parseGeneric(rows)
  }

  return detected.parse(rows)
}

interface BankFormat {
  name:  string
  parse: (rows: string[][]) => ParseResult
}

function detectBankFormat(headers: string[]): BankFormat | null {
  const joined = headers.join('|')

  // FNB: Date|Description|Amount|Balance
  if (headers.some((h) => h.includes('transaction date')) || joined.includes('transaction date')) {
    return { name: 'FNB', parse: parseFNB }
  }

  // Standard Bank: Date,Description,Amount,Balance
  if (headers[0] === 'date' && headers[1] === 'description') {
    return { name: 'Standard Bank', parse: parseStandardBank }
  }

  // Capitec: Date|Description|Debit|Credit|Balance
  if (headers.some((h) => h === 'debit') && headers.some((h) => h === 'credit')) {
    return { name: 'Capitec/Nedbank', parse: parseDebitCredit }
  }

  // Absa: similar to Standard Bank
  if (joined.includes('posting date') || joined.includes('value date')) {
    return { name: 'Absa', parse: parseAbsa }
  }

  return null
}

function parseStandardBank(rows: string[][]): ParseResult {
  const transactions: ParsedTransaction[] = []
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const [rawDate, description, rawAmount, rawBalance] = rows[i]
    const parsed = parseRow(rawDate, description, rawAmount, rawBalance, i + 1)
    if (parsed.error) errors.push(parsed.error)
    else if (parsed.tx)  transactions.push(parsed.tx)
  }

  return { transactions, errors, bank: 'Standard Bank' }
}

function parseFNB(rows: string[][]): ParseResult {
  const transactions: ParsedTransaction[] = []
  const errors: string[] = []

  // FNB has a few header rows before data starts — find the data start
  let dataStart = 0
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map((c) => c.toLowerCase().trim())
    if (row[0] === 'date' || row[0] === 'transaction date') { dataStart = i + 1; break }
  }

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 3) continue
    const parsed = parseRow(row[0], row[1], row[2], row[3], i + 1)
    if (parsed.error) errors.push(parsed.error)
    else if (parsed.tx)  transactions.push(parsed.tx)
  }

  return { transactions, errors, bank: 'FNB' }
}

function parseDebitCredit(rows: string[][]): ParseResult {
  // Capitec/Nedbank: Date | Description | Debit | Credit | Balance
  const transactions: ParsedTransaction[] = []
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const [rawDate, description, rawDebit, rawCredit, rawBalance] = rows[i]
    const debit  = parseAmount(rawDebit)
    const credit = parseAmount(rawCredit)
    const amount = credit !== null ? credit : (debit !== null ? -debit : null)

    if (!rawDate || amount === null) continue

    transactions.push({
      date:        normaliseDate(rawDate),
      description: (description ?? '').trim(),
      amount,
      balance:     parseAmount(rawBalance),
      reference:   null,
    })
  }

  return { transactions, errors, bank: 'Capitec / Nedbank' }
}

function parseAbsa(rows: string[][]): ParseResult {
  // Similar to Standard Bank but may have different column order
  return parseStandardBank(rows)
}

function parseGeneric(rows: string[][]): ParseResult {
  const transactions: ParsedTransaction[] = []
  const errors: string[] = []

  // Try to auto-detect date, description, amount columns
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 2) continue

    // Heuristic: first column that looks like a date = date col
    let dateIdx = -1, amountIdx = -1, descIdx = -1
    row.forEach((cell, idx) => {
      if (dateIdx < 0 && looksLikeDate(cell))   dateIdx   = idx
      if (amountIdx < 0 && looksLikeAmount(cell)) amountIdx = idx
      if (descIdx < 0 && idx !== dateIdx && idx !== amountIdx && cell.trim().length > 3) descIdx = idx
    })

    if (dateIdx < 0 || amountIdx < 0) { errors.push(`Row ${i + 1}: could not detect date/amount`); continue }

    transactions.push({
      date:        normaliseDate(row[dateIdx]),
      description: descIdx >= 0 ? row[descIdx].trim() : '',
      amount:      parseAmount(row[amountIdx]) ?? 0,
      balance:     null,
      reference:   null,
    })
  }

  return { transactions, errors, bank: 'Unknown (auto-detected)' }
}

// ── Helpers ───────────────────────────────────────────────

function parseRow(
  rawDate: string,
  description: string,
  rawAmount: string,
  rawBalance: string | undefined,
  lineNum: number
): { tx?: ParsedTransaction; error?: string } {
  if (!rawDate?.trim()) return {}

  const amount = parseAmount(rawAmount)
  if (amount === null) return { error: `Row ${lineNum}: could not parse amount "${rawAmount}"` }

  return {
    tx: {
      date:        normaliseDate(rawDate),
      description: (description ?? '').trim(),
      amount,
      balance:     rawBalance ? (parseAmount(rawBalance) ?? null) : null,
      reference:   null,
    },
  }
}

export function parseAmount(raw: string | undefined | null): number | null {
  if (!raw) return null
  // Remove R, spaces, quotes; handle South African format: 1 234,56 → 1234.56
  const cleaned = raw.trim()
    .replace(/^R\s*/i, '')
    .replace(/['"]/g, '')
    .replace(/\s/g, '')
    .replace(/,(\d{2})$/, '.$1')  // trailing comma as decimal separator
    .replace(/,/g, '')             // thousands separator

  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

export function normaliseDate(raw: string): string {
  // Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY
  raw = raw.trim()

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  // DD MMM YYYY
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  const dmy2 = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/)
  if (dmy2) {
    const mon = months[dmy2[2].toLowerCase()]
    const year = dmy2[3].length === 2 ? `20${dmy2[3]}` : dmy2[3]
    if (mon) return `${year}-${mon}-${dmy2[1].padStart(2, '0')}`
  }

  return raw  // return as-is if unknown format
}

function looksLikeDate(s: string): boolean {
  return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s)
}

function looksLikeAmount(s: string): boolean {
  return /^-?R?\s*[\d,\s]+(\.\d{1,2})?$/.test(s.trim())
}
