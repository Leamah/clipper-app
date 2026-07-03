// ============================================================
// Tax Pack Export — one-click PDF summary + CSV of raw records
// ============================================================
// Client-side only (jsPDF), same conventions as lib/pdf-export.ts.
// PDF is Starter+; CSV is available to all tiers.
// ============================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
  KlippaProfile, KlippaIncomeRecord, KlippaExpenseRecord,
  TaxCalculationResult, IncomeType, ExpenseCategory,
} from '@/lib/types'
import { INCOME_TYPE_LABELS, EXPENSE_CATEGORY_LABELS } from '@/lib/types'

const EMERALD = [16, 185, 129] as [number, number, number]
const ZINC900 = [24,  24,  27] as [number, number, number]
const ZINC700 = [63,  63,  70] as [number, number, number]
const WHITE   = [255, 255, 255] as [number, number, number]

function fmtRand(n: number): string {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface TaxPackData {
  profile:        Pick<KlippaProfile, 'full_name' | 'tax_number' | 'id_number'>
  taxYear:        number
  incomeRecords:  KlippaIncomeRecord[]
  expenseRecords: KlippaExpenseRecord[]   // confirmed only
  taxResult:      TaxCalculationResult | null
  businessKm:     number
  totalKm:        number
}

/** Branded multi-section tax pack PDF (Starter+) */
export function exportTaxPackPDF(data: TaxPackData): void {
  const { profile, taxYear, incomeRecords, expenseRecords, taxResult } = data
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── Header ────────────────────────────────────────────────
  doc.setFillColor(...ZINC900)
  doc.rect(0, 0, 210, 42, 'F')
  doc.setFillColor(...EMERALD)
  doc.rect(0, 0, 6, 42, 'F')

  doc.setTextColor(...EMERALD)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('TAX PACK', 14, 16)

  doc.setTextColor(...WHITE)
  doc.setFontSize(10)
  doc.text(`Tax year ${taxYear} (ending 28/29 Feb ${taxYear})`, 14, 24)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Taxpayer: ${profile.full_name ?? '—'}`, 14, 31)
  const refs = [
    profile.tax_number ? `Tax ref: ${profile.tax_number}` : null,
    profile.id_number  ? `ID: ${profile.id_number}`       : null,
  ].filter(Boolean).join('   ')
  if (refs) doc.text(refs, 14, 37)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-ZA')}`, 150, 37)

  let y = 50

  // ── Income by type ────────────────────────────────────────
  const incomeByType = new Map<IncomeType, { count: number; total: number }>()
  for (const r of incomeRecords) {
    const cur = incomeByType.get(r.income_type) ?? { count: 0, total: 0 }
    incomeByType.set(r.income_type, { count: cur.count + 1, total: cur.total + r.amount })
  }
  const totalIncome = incomeRecords.reduce((s, r) => s + r.amount, 0)

  doc.setTextColor(...ZINC700)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('1 · Income summary', 14, y)

  autoTable(doc, {
    startY: y + 3,
    head: [['Income type', 'Records', 'Total']],
    body: [
      ...[...incomeByType.entries()].map(([type, v]) => [
        INCOME_TYPE_LABELS[type] ?? type, String(v.count), fmtRand(v.total),
      ]),
      [{ content: 'Total income', styles: { fontStyle: 'bold' as const } }, String(incomeRecords.length), { content: fmtRand(totalIncome), styles: { fontStyle: 'bold' as const } }],
    ],
    theme: 'grid',
    styles:     { fontSize: 9, cellPadding: 2.5, textColor: [30, 30, 30] },
    headStyles: { fillColor: EMERALD, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: { 1: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' } },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10

  // ── Expenses by category ──────────────────────────────────
  const expByCat = new Map<ExpenseCategory, { count: number; total: number; deductible: number }>()
  for (const r of expenseRecords) {
    const cur = expByCat.get(r.category) ?? { count: 0, total: 0, deductible: 0 }
    expByCat.set(r.category, {
      count:      cur.count + 1,
      total:      cur.total + r.amount,
      deductible: cur.deductible + r.deductible_amount,
    })
  }
  const totalExp    = expenseRecords.reduce((s, r) => s + r.amount, 0)
  const totalDeduct = expenseRecords.reduce((s, r) => s + r.deductible_amount, 0)

  doc.setTextColor(...ZINC700)
  doc.setFontSize(11)
  doc.text('2 · Business expenses (confirmed)', 14, y)

  autoTable(doc, {
    startY: y + 3,
    head: [['Category', 'Records', 'Spent', 'Deductible']],
    body: [
      ...[...expByCat.entries()].map(([cat, v]) => [
        EXPENSE_CATEGORY_LABELS[cat] ?? cat, String(v.count), fmtRand(v.total), fmtRand(v.deductible),
      ]),
      [
        { content: 'Total', styles: { fontStyle: 'bold' as const } },
        String(expenseRecords.length),
        { content: fmtRand(totalExp), styles: { fontStyle: 'bold' as const } },
        { content: fmtRand(totalDeduct), styles: { fontStyle: 'bold' as const } },
      ],
    ],
    theme: 'grid',
    styles:     { fontSize: 9, cellPadding: 2.5, textColor: [30, 30, 30] },
    headStyles: { fillColor: EMERALD, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: { 1: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 36, halign: 'right' }, 3: { cellWidth: 36, halign: 'right' } },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10

  // ── Tax calculation ───────────────────────────────────────
  if (taxResult) {
    if (y > 200) { doc.addPage(); y = 20 }
    doc.setTextColor(...ZINC700)
    doc.setFontSize(11)
    doc.text('3 · Estimated tax calculation', 14, y)

    const rows: (string | number)[][] = [
      ['Gross income', fmtRand(taxResult.grossIncome)],
      ['Retirement contributions (S11F)', `− ${fmtRand(taxResult.section11fRa)}`],
      ['Home office deduction', `− ${fmtRand(taxResult.homeOffice)}`],
      ['Travel deduction', `− ${fmtRand(taxResult.travel)}`],
      ['Interest exemption', `− ${fmtRand(taxResult.interestExemption)}`],
      ['Business expenses', `− ${fmtRand(taxResult.otherDeductions)}`],
      ['Taxable income', fmtRand(taxResult.taxableIncome)],
      ['Gross tax', fmtRand(taxResult.grossTax)],
      ['Rebates', `− ${fmtRand(taxResult.totalRebates)}`],
      ['Medical aid credits (S6A)', `− ${fmtRand(taxResult.medicalAidCredits)}`],
      ['Tax payable', fmtRand(taxResult.taxPayable)],
      ['PAYE already deducted', `− ${fmtRand(taxResult.employeesTaxPaid)}`],
      [taxResult.netTaxPayable >= 0 ? 'Net tax due to SARS' : 'Estimated refund', fmtRand(Math.abs(taxResult.netTaxPayable))],
    ]
    if (taxResult.investTaxPayable > 0) {
      rows.push(['Dividend withholding tax (20%)', fmtRand(taxResult.dwtOnDividends)])
      rows.push(['Capital gains tax', fmtRand(taxResult.cgtPayable)])
    }

    autoTable(doc, {
      startY: y + 3,
      body: rows,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2, textColor: [30, 30, 30] },
      columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
      didParseCell: (d) => {
        const label = String(d.row.cells[0]?.raw ?? '')
        if (['Taxable income', 'Tax payable', 'Net tax due to SARS', 'Estimated refund'].includes(label)) {
          d.cell.styles.fontStyle = 'bold'
          if (label.startsWith('Net') || label.startsWith('Estimated')) d.cell.styles.textColor = EMERALD
        }
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Travel summary ────────────────────────────────────────
  if (data.totalKm > 0) {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setTextColor(...ZINC700)
    doc.setFontSize(11)
    doc.text('4 · Travel', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)
    doc.text(
      `Business km: ${data.businessKm.toLocaleString('en-ZA')} of ${data.totalKm.toLocaleString('en-ZA')} total km` +
      (taxResult ? ` · Travel deduction: ${fmtRand(taxResult.travel)}` : ''),
      14, y + 6,
    )
    y += 14
  }

  // ── Disclaimer ────────────────────────────────────────────
  doc.setFontSize(7.5)
  doc.setTextColor(150, 150, 150)
  doc.text(
    'Estimates based on captured records and SARS published rates. Not financial or tax advice — verify against your SARS eFiling assessment.',
    14, 288,
  )
  doc.text('Generated with Klippa · klippa.co.za', 14, 292)

  doc.save(`Klippa-Tax-Pack-${taxYear}.pdf`)
}

/** Raw records CSV (all tiers) — income + expenses in one file */
export function exportTaxPackCSV(data: Pick<TaxPackData, 'taxYear' | 'incomeRecords' | 'expenseRecords'>): void {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines: string[] = [
    'record_type,date,name,type_or_category,description,amount,deductible_percentage,deductible_amount',
  ]
  for (const r of data.incomeRecords) {
    lines.push([
      'income', r.received_date ?? '', esc(r.source_name),
      INCOME_TYPE_LABELS[r.income_type] ?? r.income_type,
      esc(r.description), r.amount.toFixed(2), '', '',
    ].join(','))
  }
  for (const r of data.expenseRecords) {
    lines.push([
      'expense', r.expense_date ?? '', esc(r.merchant_name ?? ''),
      EXPENSE_CATEGORY_LABELS[r.category] ?? r.category,
      esc(r.description), r.amount.toFixed(2),
      String(r.deductible_percentage), r.deductible_amount.toFixed(2),
    ].join(','))
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `Klippa-Records-${data.taxYear}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
