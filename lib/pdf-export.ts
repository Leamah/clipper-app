// ============================================================
// PDF Export Utilities — Timesheets & SARS Logbook
// ============================================================
// Uses jsPDF + jspdf-autotable.
// Client-side only — call from onClick handlers, not server routes.
// ============================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, getDaysInMonth, getDay } from 'date-fns'
import type { KlippaProfile, KlippaMileageTrip, OrgBranding } from '@/lib/types'
import type { KlippaTimesheet, KlippaTimesheetEntry, KlippaExpenseRecord } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'
import { getSAHolidayName } from '@/lib/sa-holidays'

// ── Shared helpers ────────────────────────────────────────

const EMERALD = [16, 185, 129] as [number, number, number]   // #10b981 (default fallback)
const ZINC900 = [24,  24,  27] as [number, number, number]   // zinc-900
const ZINC700 = [63,  63,  70] as [number, number, number]   // zinc-700
const WHITE   = [255, 255, 255] as [number, number, number]

/** Parse a CSS hex colour like '#10b981' → [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  if (h.length !== 6) return EMERALD
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return EMERALD
  return [r, g, b]
}

/** Fetch a remote image URL and return a base64 data-URI (browser only) */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob   = await res.blob()
    return await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function fmtRand(n: number): string {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Timesheet PDF ─────────────────────────────────────────

export async function exportTimesheetPDF(
  timesheet: KlippaTimesheet & { client_name?: string | null; client_contact?: string | null },
  entries:   KlippaTimesheetEntry[],
  options?:  { blob?: boolean; branding?: OrgBranding },
): Promise<void | Blob> {
  const branding   = options?.branding
  const ACCENT     = branding?.brandColor ? hexToRgb(branding.brandColor) : EMERALD
  const logoDataUrl = branding?.logoUrl   ? await fetchImageAsDataUrl(branding.logoUrl) : null

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const monthDate  = new Date(timesheet.month + 'T00:00:00')
  const monthLabel = format(monthDate, 'MMMM yyyy')
  const year       = monthDate.getFullYear()
  const month0     = monthDate.getMonth()            // 0-indexed
  const daysCount  = getDaysInMonth(monthDate)

  // Entry lookup by date
  const entryMap = new Map<string, KlippaTimesheetEntry>()
  for (const e of entries) {
    entryMap.set(e.entry_date, e)
  }

  // ── Header block ─────────────────────────────────────────
  doc.setFillColor(...ZINC900)
  doc.rect(0, 0, 210, 40, 'F')

  // Accent stripe using brand color
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, 6, 40, 'F')

  // Logo (top-right if available, else brand-color K badge)
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', 175, 5, 24, 24) } catch { /* skip if format unsupported */ }
  } else {
    doc.setFillColor(...ACCENT)
    doc.roundedRect(175, 8, 22, 22, 3, 3, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(branding?.orgName?.charAt(0)?.toUpperCase() ?? 'K', 186, 22, { align: 'center' })
  }

  doc.setTextColor(...ACCENT)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('MONTHLY TIMESHEET', 14, 14)

  doc.setTextColor(...WHITE)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`For the month of: ${monthLabel}`,                          14, 22)
  doc.text(`Consultant: ${timesheet.consultant_name ?? ''}`,           14, 28)
  doc.text(`Position: ${timesheet.position ?? ''}`,                    14, 34)
  doc.text(`Client company: ${timesheet.client_name ?? ''}`,          115, 22)
  doc.text(`Client contact: ${timesheet.client_contact ?? ''}`,       115, 28)
  if (timesheet.hourly_rate) {
    doc.text(`Hourly rate: ${fmtRand(timesheet.hourly_rate)}`,         115, 34)
  }

  // ── Table ─────────────────────────────────────────────────
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const rows: (string | number)[][] = []
  let totalHours = 0

  for (let d = 1; d <= daysCount; d++) {
    const dateObj  = new Date(year, month0, d)
    const isoDate  = format(dateObj, 'yyyy-MM-dd')
    const dayName  = dayNames[getDay(dateObj)]
    const holiday  = getSAHolidayName(isoDate)
    const entry    = entryMap.get(isoDate)
    const isWkend  = getDay(dateObj) === 0 || getDay(dateObj) === 6

    let hoursCell: string = ''
    let noteCell: string  = ''

    if (entry) {
      hoursCell = String(entry.hours)
      noteCell  = entry.comment ?? ''
      totalHours += Number(entry.hours)
    } else if (isWkend) {
      noteCell = 'Weekend'
    } else if (holiday) {
      noteCell = `Public Holiday — ${holiday}`
    }

    rows.push([d, isoDate, dayName, hoursCell, noteCell])
  }

  autoTable(doc, {
    startY: 44,
    head: [['#', 'Date', 'Day', 'Hours', 'Notes / Comments']],
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: ACCENT,
      textColor: WHITE,
      fontStyle:  'bold',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 18 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      // Highlight weekend rows grey
      if (data.section === 'body') {
        const note = String(data.row.cells[4]?.raw ?? '')
        if (note === 'Weekend') {
          data.cell.styles.fillColor = [240, 240, 240]
          data.cell.styles.textColor = [160, 160, 160]
        } else if (note.startsWith('Public Holiday')) {
          data.cell.styles.fillColor = [254, 243, 199]   // amber-100
          data.cell.styles.textColor = [146, 64, 14]     // amber-800
        }
      }
    },
  })

  // ── Footer summary + sign-off ─────────────────────────────
  // Keep the totals and BOTH signature boxes together. If they don't
  // fit under the (possibly multi-page) table, start a fresh page so
  // the signature section is ALWAYS present and never clipped.
  const pageH   = doc.internal.pageSize.getHeight()   // 297mm (A4)
  const boxH    = 36
  const BLOCK_H = 8 /* totals */ + 10 /* gap */ + boxH + 8 /* breathing room */
  const billable = timesheet.hourly_rate ? totalHours * timesheet.hourly_rate : null

  let cursorY = (doc as any).lastAutoTable.finalY + 8
  if (cursorY + BLOCK_H > pageH - 14) {
    doc.addPage()
    cursorY = 20
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.text(`Total Hours: ${totalHours}`, 14, cursorY)
  if (billable !== null) {
    doc.text(`Billable Amount: ${fmtRand(billable)}`, 80, cursorY)
  }

  // ── Sign-off section (constant: name, signature + date fields) ──
  const sigY = cursorY + 10

  /** Draw one signature box at x. Shows drawn signature image when signed, blank lines when not. */
  const signBox = (
    x:         number,
    title:     string,
    line1:     string,
    line2:     string,
    signedAt?: string | null,
    sigImg?:   string | null,
  ) => {
    doc.setDrawColor(...ZINC700)
    doc.setLineWidth(0.3)
    doc.rect(x, sigY, 87, boxH)

    // Header bar
    doc.setFillColor(...ZINC900)
    doc.rect(x, sigY, 87, 7, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(title, x + 3.5, sigY + 5)

    // Name / position / company
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(line1, x + 3, sigY + 13)
    doc.text(line2, x + 3, sigY + 18)

    if (signedAt) {
      // Drawn signature image (if available), else "Digitally signed" text
      if (sigImg) {
        try {
          doc.addImage(sigImg, 'PNG', x + 3, sigY + 20, 60, 12)
        } catch {
          doc.setTextColor(...ACCENT)
          doc.setFont('helvetica', 'bolditalic')
          doc.text('Digitally signed', x + 3, sigY + 28)
          doc.setFont('helvetica', 'normal')
        }
      } else {
        doc.setTextColor(...ACCENT)
        doc.setFont('helvetica', 'bolditalic')
        doc.text('Digitally signed', x + 3, sigY + 28)
        doc.setFont('helvetica', 'normal')
      }
      // Date below signature
      const d = new Date(signedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(7)
      doc.text(`Signed: ${d}`, x + 3, sigY + 34)
      doc.setFontSize(8)
      doc.setTextColor(30, 30, 30)
    } else {
      // Blank signature + date lines for wet-ink signing
      doc.setDrawColor(120, 120, 120)
      doc.text('Signature:', x + 3, sigY + 28)
      doc.line(x + 22, sigY + 28, x + 84, sigY + 28)
      doc.text('Date:', x + 3, sigY + 34)
      doc.line(x + 16, sigY + 34, x + 50, sigY + 34)
    }
  }

  signBox(14,  'CONSULTANT',
    `Name: ${timesheet.consultant_name ?? ''}`,
    `Position: ${timesheet.position ?? ''}`,
    timesheet.consultant_signed_at,
    (timesheet as any).consultant_signature ?? null)

  signBox(109, 'CLIENT / AUTHORISED SIGNATORY',
    `Name: ${timesheet.client_contact ?? ''}`,
    `Company: ${timesheet.client_name ?? ''}`,
    timesheet.client_signed_at)

  // ── Footer branding ───────────────────────────────────────
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  const footerOrg = branding?.orgName ?? 'Klippa'
  doc.text(`Generated by ${footerOrg} via Klippa | klippa.co.za`, 14, 290)

  const orgPrefix = (branding?.orgName ?? 'Klippa').replace(/[^a-zA-Z0-9]/g, '_')
  const fileName  = `${orgPrefix}_Timesheet_${timesheet.client_name ?? 'Client'}_${format(monthDate, 'yyyy-MM')}.pdf`
    .replace(/[^a-zA-Z0-9_.-]/g, '_')

  if (options?.blob) {
    return doc.output('blob')
  }
  doc.save(fileName)
}

// ── Merged (multi-month) Timesheet PDF ────────────────────
// One client (contractor) across one or more consecutive months,
// combined into a single document with a period label, per-month
// sub-tables, a combined total and a single sign-off section.

export async function exportMergedTimesheetPDF(
  meta: {
    consultant_name?:      string | null
    position?:             string | null
    client_name?:          string | null
    client_contact?:       string | null
    hourly_rate?:          number | null
    consultant_signed_at?: string | null
    consultant_signature?: string | null
    client_signed_at?:     string | null
  },
  months:   { monthISO: string; entries: KlippaTimesheetEntry[] }[],
  options?: { blob?: boolean; branding?: OrgBranding },
): Promise<void | Blob> {
  const branding    = options?.branding
  const ACCENT      = branding?.brandColor ? hexToRgb(branding.brandColor) : EMERALD
  const logoDataUrl = branding?.logoUrl    ? await fetchImageAsDataUrl(branding.logoUrl) : null

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const sorted     = [...months].sort((a, b) => a.monthISO.localeCompare(b.monthISO))
  const firstLabel = sorted.length ? format(new Date(sorted[0].monthISO + 'T00:00:00'), 'MMMM yyyy') : ''
  const lastLabel  = sorted.length ? format(new Date(sorted[sorted.length - 1].monthISO + 'T00:00:00'), 'MMMM yyyy') : ''
  const periodLabel = firstLabel === lastLabel ? firstLabel : `${firstLabel} – ${lastLabel}`

  // ── Header block ─────────────────────────────────────────
  doc.setFillColor(...ZINC900)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, 6, 40, 'F')

  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', 175, 5, 24, 24) } catch { /* skip */ }
  } else {
    doc.setFillColor(...ACCENT)
    doc.roundedRect(175, 8, 22, 22, 3, 3, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(branding?.orgName?.charAt(0)?.toUpperCase() ?? 'K', 186, 22, { align: 'center' })
  }

  doc.setTextColor(...ACCENT)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('TIMESHEET', 14, 14)

  doc.setTextColor(...WHITE)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Period: ${periodLabel}`,                          14, 22)
  doc.text(`Consultant: ${meta.consultant_name ?? ''}`,        14, 28)
  doc.text(`Position: ${meta.position ?? ''}`,                 14, 34)
  doc.text(`Client company: ${meta.client_name ?? ''}`,       115, 22)
  doc.text(`Client contact: ${meta.client_contact ?? ''}`,    115, 28)
  if (meta.hourly_rate) {
    doc.text(`Hourly rate: ${fmtRand(meta.hourly_rate)}`,     115, 34)
  }

  // ── Per-month tables ─────────────────────────────────────
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  let totalHours = 0
  let startY     = 44

  for (const grp of sorted) {
    const monthDate = new Date(grp.monthISO + 'T00:00:00')
    const year      = monthDate.getFullYear()
    const month0    = monthDate.getMonth()
    const daysCount = getDaysInMonth(monthDate)

    const entryMap = new Map<string, KlippaTimesheetEntry>()
    for (const e of grp.entries) entryMap.set(e.entry_date, e)

    const rows: (string | number)[][] = []
    let monthHours = 0

    for (let d = 1; d <= daysCount; d++) {
      const dateObj = new Date(year, month0, d)
      const iso     = format(dateObj, 'yyyy-MM-dd')
      const dayName = dayNames[getDay(dateObj)]
      const holiday = getSAHolidayName(iso)
      const entry   = entryMap.get(iso)
      const isWkend = getDay(dateObj) === 0 || getDay(dateObj) === 6

      let hoursCell = '', noteCell = ''
      if (entry) {
        hoursCell = String(entry.hours)
        noteCell  = entry.comment ?? ''
        monthHours += Number(entry.hours)
      } else if (isWkend) {
        noteCell = 'Weekend'
      } else if (holiday) {
        noteCell = `Public Holiday — ${holiday}`
      }
      rows.push([d, iso, dayName, hoursCell, noteCell])
    }
    totalHours += monthHours

    autoTable(doc, {
      startY,
      head: [
        [{ content: `${format(monthDate, 'MMMM yyyy')}  —  ${monthHours} hrs`, colSpan: 5 }],
        ['#', 'Date', 'Day', 'Hours', 'Notes / Comments'],
      ] as never,
      body: rows,
      theme: 'grid',
      styles:     { fontSize: 8, cellPadding: 2, textColor: [30, 30, 30] },
      headStyles: { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 18 },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const note = String(data.row.cells[4]?.raw ?? '')
          if (note === 'Weekend') {
            data.cell.styles.fillColor = [240, 240, 240]
            data.cell.styles.textColor = [160, 160, 160]
          } else if (note.startsWith('Public Holiday')) {
            data.cell.styles.fillColor = [254, 243, 199]
            data.cell.styles.textColor = [146, 64, 14]
          }
        }
      },
    })
    startY = (doc as any).lastAutoTable.finalY + 6
  }

  // ── Combined total + sign-off (page-break safe) ──────────
  const pageH    = doc.internal.pageSize.getHeight()
  const boxH     = 36
  const BLOCK_H  = 8 + 10 + boxH + 8
  const billable = meta.hourly_rate ? totalHours * meta.hourly_rate : null

  let cursorY = startY + 2
  if (cursorY + BLOCK_H > pageH - 14) {
    doc.addPage()
    cursorY = 20
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.text(`Total Hours: ${totalHours}`, 14, cursorY)
  if (billable !== null) {
    doc.text(`Billable Amount: ${fmtRand(billable)}`, 80, cursorY)
  }

  const sigY = cursorY + 10
  const signBox = (
    x:         number,
    title:     string,
    line1:     string,
    line2:     string,
    signedAt?: string | null,
    sigImg?:   string | null,
  ) => {
    doc.setDrawColor(...ZINC700)
    doc.setLineWidth(0.3)
    doc.rect(x, sigY, 87, boxH)

    // Header bar
    doc.setFillColor(...ZINC900)
    doc.rect(x, sigY, 87, 7, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(title, x + 3.5, sigY + 5)

    // Name / position / company
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(line1, x + 3, sigY + 13)
    doc.text(line2, x + 3, sigY + 18)

    if (signedAt) {
      // Drawn signature image (if available), else "Digitally signed" text
      if (sigImg) {
        try {
          doc.addImage(sigImg, 'PNG', x + 3, sigY + 20, 60, 12)
        } catch {
          doc.setTextColor(...ACCENT)
          doc.setFont('helvetica', 'bolditalic')
          doc.text('Digitally signed', x + 3, sigY + 28)
          doc.setFont('helvetica', 'normal')
        }
      } else {
        doc.setTextColor(...ACCENT)
        doc.setFont('helvetica', 'bolditalic')
        doc.text('Digitally signed', x + 3, sigY + 28)
        doc.setFont('helvetica', 'normal')
      }
      // Date below signature
      const d = new Date(signedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(7)
      doc.text(`Signed: ${d}`, x + 3, sigY + 34)
      doc.setFontSize(8)
      doc.setTextColor(30, 30, 30)
    } else {
      // Blank signature + date lines for wet-ink signing
      doc.setDrawColor(120, 120, 120)
      doc.text('Signature:', x + 3, sigY + 28)
      doc.line(x + 22, sigY + 28, x + 84, sigY + 28)
      doc.text('Date:', x + 3, sigY + 34)
      doc.line(x + 16, sigY + 34, x + 50, sigY + 34)
    }
  }

  signBox(14,  'CONSULTANT',
    `Name: ${meta.consultant_name ?? ''}`,
    `Position: ${meta.position ?? ''}`,
    meta.consultant_signed_at,
    meta.consultant_signature ?? null)
  signBox(109, 'CLIENT / AUTHORISED SIGNATORY',
    `Name: ${meta.client_contact ?? ''}`,
    `Company: ${meta.client_name ?? ''}`,
    meta.client_signed_at)

  // ── Footer branding ──────────────────────────────────────
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  const footerOrg = branding?.orgName ?? 'Klippa'
  doc.text(`Generated by ${footerOrg} via Klippa | klippa.co.za`, 14, pageH - 7)

  const orgPrefix = (branding?.orgName ?? 'Klippa').replace(/[^a-zA-Z0-9]/g, '_')
  const rangeTag  = sorted.length
    ? `${sorted[0].monthISO.slice(0, 7)}_${sorted[sorted.length - 1].monthISO.slice(0, 7)}`
    : 'period'
  const fileName  = `${orgPrefix}_Timesheet_${meta.client_name ?? 'Client'}_${rangeTag}.pdf`
    .replace(/[^a-zA-Z0-9_.-]/g, '_')

  if (options?.blob) {
    return doc.output('blob')
  }
  doc.save(fileName)
}

// ── SARS Logbook PDF ──────────────────────────────────────

export async function exportLogbookPDF(
  profile:  Pick<KlippaProfile,
    'full_name' | 'tax_number' | 'vehicle_make' | 'vehicle_model' | 'vehicle_year' |
    'vehicle_value' | 'vehicle_registration' | 'vehicle_purchase_date' |
    'opening_odometer' | 'closing_odometer'>,
  trips:    KlippaMileageTrip[],
  taxYear:  number,  // e.g. 2025 = year ending 28 Feb 2025
  branding?: OrgBranding,
): Promise<void> {
  const ACCENT      = branding?.brandColor ? hexToRgb(branding.brandColor) : EMERALD
  const logoDataUrl = branding?.logoUrl    ? await fetchImageAsDataUrl(branding.logoUrl) : null

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const yearEnd = `28 February ${taxYear}`
  const businessTrips = trips.filter(t => t.trip_type === 'business')
  const totalBizKm    = businessTrips.reduce((s, t) => s + t.distance_km, 0)
  const totalKm       = (profile.closing_odometer ?? 0) - (profile.opening_odometer ?? 0)
  const totalPrivKm   = Math.max(0, totalKm - totalBizKm)

  const vehicleLabel = [
    profile.vehicle_make,
    profile.vehicle_model,
    profile.vehicle_year ? `(${profile.vehicle_year})` : null,
  ].filter(Boolean).join(' ')

  // ── Header ────────────────────────────────────────────────
  doc.setFillColor(...ZINC900)
  doc.rect(0, 0, 297, 36, 'F')

  // Accent stripe
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, 6, 36, 'F')

  // Logo or badge (top-right)
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', 261, 5, 24, 24) } catch { /* skip */ }
  } else {
    doc.setFillColor(...ACCENT)
    doc.roundedRect(261, 7, 22, 22, 3, 3, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(branding?.orgName?.charAt(0)?.toUpperCase() ?? 'K', 272, 20, { align: 'center' })
  }

  doc.setTextColor(...ACCENT)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('VEHICLE LOGBOOK', 14, 12)

  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'normal')
  doc.text(`For the year ended ${yearEnd}`,                  14, 20)
  doc.text(`Taxpayer: ${profile.full_name ?? ''}`,           14, 27)
  doc.text(`Tax number: ${profile.tax_number ?? ''}`,        14, 33)

  doc.text(`Vehicle: ${vehicleLabel}`,                       120, 20)
  if (profile.vehicle_registration) {
    doc.text(`Registration: ${profile.vehicle_registration}`, 120, 27)
  }
  if ((profile.vehicle_value ?? 0) > 0) {
    doc.text(`Purchase price: ${fmtRand(profile.vehicle_value ?? 0)}`, 120, 33)
  }

  if (profile.vehicle_purchase_date) {
    doc.text(`Purchase date: ${profile.vehicle_purchase_date}`, 220, 27)
  }

  // ── Summary row ───────────────────────────────────────────
  autoTable(doc, {
    startY: 40,
    head: [["Opening km's", "Closing km's", "Total km's", "Business km's", "Private km's"]],
    body: [[
      profile.opening_odometer ?? 0,
      profile.closing_odometer ?? 0,
      totalKm,
      totalBizKm,
      totalPrivKm,
    ]],
    theme: 'grid',
    styles: { fontSize: 9, halign: 'center' },
    headStyles: { fillColor: ZINC700, textColor: WHITE },
    margin: { left: 14, right: 14 },
  })

  // ── Trip table ────────────────────────────────────────────
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const tripRows = businessTrips
    .sort((a, b) => a.trip_date.localeCompare(b.trip_date))
    .map(t => {
      const d     = new Date(t.trip_date + 'T00:00:00')
      const day   = dayNames[getDay(d)]
      const date  = format(d, 'dd MMM yyyy')
      const openKm  = t.odometer_start ?? ''
      const closeKm = t.odometer_end   ?? ''
      const bizKm   = t.distance_km
      const from    = t.start_location ?? ''
      const to      = t.end_location   ?? ''
      const reason  = t.purpose        ?? ''
      return [day, date, openKm, closeKm, bizKm, from, to, reason]
    })

  const prevY = (doc as any).lastAutoTable.finalY + 4

  autoTable(doc, {
    startY: prevY,
    head: [['Day', 'Date', 'Opening KM', 'Closing KM', 'Business KM', 'From (Suburb)', 'To (Suburb)', 'Reason for Travel']],
    body: tripRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 26 },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 40 },
      6: { cellWidth: 40 },
      7: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  })

  // Branding
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  const lbFooterOrg = branding?.orgName ?? 'Klippa'
  doc.text(`Generated by ${lbFooterOrg} via Klippa | klippa.co.za`, 14, 205)

  const lbPrefix = (branding?.orgName ?? 'Klippa').replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`${lbPrefix}_Logbook_${taxYear}.pdf`)
}

// ── SARS Audit Pack PDF ───────────────────────────────────
// A defence-ready bundle of every confirmed expense: the claim, the SARS
// rule it rests on, the evidence to keep on file, and the audit triggers
// SARS would flag. Pure leverage on data already captured at classification.

const RISK_RGB: Record<string, [number, number, number]> = {
  high:   [220,  38,  38],   // red-600
  medium: [217, 119,   6],   // amber-600
  low:    [ 22, 163,  74],   // green-600
}

export async function exportAuditPackPDF(
  profile:  Pick<KlippaProfile, 'full_name' | 'tax_number'>,
  expenses: KlippaExpenseRecord[],
  taxYear:  number,  // e.g. 2025 = year ending 28 Feb 2025
  branding?: OrgBranding,
): Promise<void> {
  const ACCENT      = branding?.brandColor ? hexToRgb(branding.brandColor) : EMERALD
  const logoDataUrl = branding?.logoUrl    ? await fetchImageAsDataUrl(branding.logoUrl) : null

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()   // 210
  const pageH = doc.internal.pageSize.getHeight()  // 297

  const yearEnd      = `28 February ${taxYear}`
  const totalClaimed = expenses.reduce((s, e) => s + e.amount, 0)
  const totalDeduct  = expenses.reduce((s, e) => s + e.deductible_amount, 0)
  const highRisk     = expenses.filter(e => e.ai_audit_risk === 'high').length

  // ── Header ────────────────────────────────────────────────
  const drawHeader = () => {
    doc.setFillColor(...ZINC900)
    doc.rect(0, 0, pageW, 34, 'F')
    doc.setFillColor(...ACCENT)
    doc.rect(0, 0, 6, 34, 'F')

    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', pageW - 30, 5, 22, 22) } catch { /* skip */ }
    } else {
      doc.setFillColor(...ACCENT)
      doc.roundedRect(pageW - 30, 6, 22, 22, 3, 3, 'F')
      doc.setTextColor(...WHITE)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(branding?.orgName?.charAt(0)?.toUpperCase() ?? 'K', pageW - 19, 19, { align: 'center' })
    }

    doc.setTextColor(...ACCENT)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('SARS AUDIT PACK', 14, 13)

    doc.setFontSize(8.5)
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'normal')
    doc.text(`For the year ended ${yearEnd}`,            14, 20)
    doc.text(`Taxpayer: ${profile.full_name ?? ''}`,    14, 26)
    doc.text(`Tax number: ${profile.tax_number ?? '—'}`, 14, 31)
  }

  drawHeader()

  // ── Summary band ──────────────────────────────────────────
  autoTable(doc, {
    startY: 40,
    head: [['Confirmed expenses', 'Total claimed', 'Total deductible', 'High audit-risk items']],
    body: [[
      String(expenses.length),
      fmtRand(totalClaimed),
      fmtRand(totalDeduct),
      String(highRisk),
    ]],
    theme: 'grid',
    styles: { fontSize: 9, halign: 'center' },
    headStyles: { fillColor: ZINC700, textColor: WHITE, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  })

  // ── Schedule of deductions ────────────────────────────────
  const scheduleRows = expenses.map(e => [
    e.expense_date ? format(new Date(e.expense_date + 'T00:00:00'), 'dd MMM yyyy') : '—',
    e.merchant_name ?? e.description ?? '—',
    EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
    fmtRand(e.amount),
    `${e.deductible_percentage}%`,
    fmtRand(e.deductible_amount),
    (e.ai_audit_risk ?? '—').toUpperCase(),
  ])

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Date', 'Merchant', 'Category', 'Amount', 'Claim %', 'Deductible', 'Risk']],
    body: scheduleRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'middle' },
    headStyles: { fillColor: ACCENT, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30 },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 16, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const risk = String(data.cell.raw).toLowerCase()
        const rgb = RISK_RGB[risk]
        if (rgb) { data.cell.styles.textColor = rgb; data.cell.styles.fontStyle = 'bold' }
      }
    },
  })

  // ── Per-expense evidence dossiers ─────────────────────────
  doc.addPage()
  let y = 18

  doc.setTextColor(...ZINC900)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Evidence dossier', 14, y)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('One entry per claim — the SARS basis, the evidence to retain, and the triggers an auditor would flag.', 14, y + 5)
  y += 14

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 14) { doc.addPage(); y = 18 }
  }

  const writeWrapped = (text: string, x: number, maxW: number, lineH = 4.2): number => {
    const lines = doc.splitTextToSize(text, maxW) as string[]
    for (const ln of lines) {
      ensureSpace(lineH + 2)
      doc.text(ln, x, y)
      y += lineH
    }
    return lines.length
  }

  expenses.forEach((e, idx) => {
    ensureSpace(34)

    // Card divider
    doc.setDrawColor(225, 225, 228)
    doc.setLineWidth(0.2)
    doc.line(14, y - 4, pageW - 14, y - 4)

    // Title row: merchant + deductible
    doc.setTextColor(...ZINC900)
    doc.setFontSize(10.5)
    doc.setFont('helvetica', 'bold')
    const title = `${idx + 1}. ${e.merchant_name ?? e.description ?? 'Expense'}`
    doc.text(doc.splitTextToSize(title, 120)[0], 14, y)

    doc.setTextColor(...ACCENT)
    doc.setFontSize(10)
    doc.text(`${fmtRand(e.deductible_amount)} deductible`, pageW - 14, y, { align: 'right' })
    y += 5

    // Meta line
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(110, 110, 110)
    const dateStr = e.expense_date ? format(new Date(e.expense_date + 'T00:00:00'), 'dd MMM yyyy') : '—'
    const cat     = EXPENSE_CATEGORY_LABELS[e.category] ?? e.category
    doc.text(`${dateStr}  ·  ${cat}  ·  ${fmtRand(e.amount)} claimed at ${e.deductible_percentage}%  ·  Risk: ${(e.ai_audit_risk ?? '—').toUpperCase()}  ·  Confidence: ${(e.ai_confidence ?? '—').toUpperCase()}`, 14, y)
    y += 6

    // SARS rule
    if (e.ai_sars_rule) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...ZINC700)
      doc.text('SARS basis', 14, y)
      y += 4
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      writeWrapped(e.ai_sars_rule, 14, pageW - 28)
      y += 2
    }

    // Reasoning
    if (e.ai_reasoning) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(90, 90, 90)
      writeWrapped(e.ai_reasoning, 14, pageW - 28)
      y += 2
    }

    // Evidence checklist
    const evidence = e.ai_required_evidence ?? []
    if (evidence.length) {
      ensureSpace(8)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(22, 163, 74)
      doc.text('Keep on file', 14, y)
      y += 4.5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      for (const item of evidence) {
        ensureSpace(6)
        // checkbox
        doc.setDrawColor(150, 150, 150)
        doc.setLineWidth(0.3)
        doc.rect(15, y - 3, 3, 3)
        const before = y
        writeWrapped(item, 21, pageW - 35)
        if (y === before) y += 4.2
        y += 0.5
      }
      y += 2
    }

    // Audit triggers
    const triggers = e.ai_audit_triggers ?? []
    if (triggers.length) {
      ensureSpace(8)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(217, 119, 6)
      doc.text('SARS audit triggers', 14, y)
      y += 4.5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      for (const item of triggers) {
        ensureSpace(6)
        doc.setTextColor(217, 119, 6)
        doc.text('!', 16, y)
        doc.setTextColor(60, 60, 60)
        const before = y
        writeWrapped(item, 21, pageW - 35)
        if (y === before) y += 4.2
        y += 0.5
      }
      y += 2
    }

    y += 4
  })

  // ── Footer on every page ──────────────────────────────────
  const footerOrg = branding?.orgName ?? 'Klippa'
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated by ${footerOrg} via Klippa | klippa.co.za`, 14, pageH - 7)
    doc.text(`Page ${p} of ${pageCount}`, pageW - 14, pageH - 7, { align: 'right' })
  }

  const apPrefix = (branding?.orgName ?? 'Klippa').replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`${apPrefix}_SARS_Audit_Pack_${taxYear}.pdf`)
}

// ── Freelancer Invoice PDF ────────────────────────────────

import type { KlippaInvoice, KlippaInvoiceItem, KlippaFreelancerClient } from '@/lib/types'

/**
 * Branded invoice PDF. Returns a Blob when options.blob is true
 * (used to attach to the send email), otherwise triggers download.
 */
export async function exportInvoicePDF(
  invoice: KlippaInvoice,
  items:   KlippaInvoiceItem[],
  client:  KlippaFreelancerClient,
  profile: Pick<KlippaProfile, 'full_name' | 'tax_number' | 'invoice_banking_details'>,
  options?: { blob?: boolean },
): Promise<void | Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const invoiceRef = `INV-${String(invoice.invoice_number).padStart(4, '0')}`

  // ── Header ────────────────────────────────────────────────
  doc.setFillColor(...ZINC900)
  doc.rect(0, 0, 210, 42, 'F')
  doc.setFillColor(...EMERALD)
  doc.rect(0, 0, 6, 42, 'F')

  doc.setTextColor(...EMERALD)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', 14, 16)

  doc.setTextColor(...WHITE)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(invoiceRef, 14, 24)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Issue date: ${invoice.issue_date}`, 14, 31)
  if (invoice.due_date) doc.text(`Due date: ${invoice.due_date}`, 14, 37)

  // From (top right)
  doc.setFontSize(9)
  doc.text('From:', 130, 16)
  doc.setFont('helvetica', 'bold')
  doc.text(profile.full_name ?? '', 130, 22)
  doc.setFont('helvetica', 'normal')
  if (profile.tax_number) doc.text(`Tax ref: ${profile.tax_number}`, 130, 28)

  // ── Bill To ───────────────────────────────────────────────
  let y = 52
  doc.setTextColor(...ZINC700)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO', 14, y)
  doc.setFontSize(10)
  doc.setTextColor(20, 20, 20)
  y += 6
  doc.text(client.name, 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (client.contact_person) { y += 5; doc.text(client.contact_person, 14, y) }
  if (client.email)          { y += 5; doc.text(client.email, 14, y) }
  if (client.vat_number)     { y += 5; doc.text(`VAT no: ${client.vat_number}`, 14, y) }
  if (client.address) {
    const lines = doc.splitTextToSize(client.address, 90)
    y += 5
    doc.text(lines, 14, y)
    y += (lines.length - 1) * 4.5
  }

  // ── Line items ────────────────────────────────────────────
  const rows = items.map((it) => [
    it.description,
    String(it.quantity),
    fmtRand(it.unit_price),
    fmtRand(it.amount),
  ])

  autoTable(doc, {
    startY: Math.max(y + 8, 76),
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body: rows,
    theme: 'grid',
    styles:     { fontSize: 9, cellPadding: 3, textColor: [30, 30, 30] },
    headStyles: { fillColor: EMERALD, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 34, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ty = (doc as any).lastAutoTable.finalY + 8

  // ── Totals ────────────────────────────────────────────────
  const totalsX = 130
  doc.setFontSize(9)
  doc.setTextColor(...ZINC700)
  doc.text('Subtotal', totalsX, ty)
  doc.setTextColor(20, 20, 20)
  doc.text(fmtRand(invoice.subtotal), 196, ty, { align: 'right' })

  if (invoice.vat_enabled) {
    ty += 6
    doc.setTextColor(...ZINC700)
    doc.text(`VAT (${invoice.vat_rate}%)`, totalsX, ty)
    doc.setTextColor(20, 20, 20)
    doc.text(fmtRand(invoice.vat_amount), 196, ty, { align: 'right' })
  }

  ty += 8
  doc.setDrawColor(...EMERALD)
  doc.setLineWidth(0.5)
  doc.line(totalsX, ty - 4, 196, ty - 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total due', totalsX, ty + 1)
  doc.text(fmtRand(invoice.total), 196, ty + 1, { align: 'right' })

  // ── Payment details ───────────────────────────────────────
  let py = ty + 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  if (invoice.payment_reference) {
    doc.setTextColor(...ZINC700)
    doc.text(`Payment reference: ${invoice.payment_reference}`, 14, py)
    py += 6
  }
  if (profile.invoice_banking_details) {
    doc.setTextColor(...ZINC700)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('PAYMENT DETAILS', 14, py)
    py += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(20, 20, 20)
    const bankLines = doc.splitTextToSize(profile.invoice_banking_details, 120)
    doc.text(bankLines, 14, py)
    py += bankLines.length * 4.5 + 2
  }
  if (invoice.notes) {
    doc.setTextColor(...ZINC700)
    const noteLines = doc.splitTextToSize(invoice.notes, 180)
    doc.text(noteLines, 14, py + 2)
    py += noteLines.length * 4.5 + 4
  }

  // ── Footer ────────────────────────────────────────────────
  doc.setFontSize(7.5)
  doc.setTextColor(150, 150, 150)
  const footer = invoice.vat_enabled
    ? 'Tax invoice · Generated with Klippa (klippa.co.za)'
    : 'This is not a VAT invoice — issuer is not VAT registered. Generated with Klippa (klippa.co.za)'
  doc.text(footer, 14, 288)

  if (options?.blob) return doc.output('blob')
  doc.save(`${invoiceRef}.pdf`)
}
