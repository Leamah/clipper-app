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
import type { KlippaTimesheet, KlippaTimesheetEntry } from '@/lib/types'
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
  timesheet: KlippaTimesheet & { client_name?: string; client_contact?: string },
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

  /** Draw one signature box at x with a constant name / signature / date layout. */
  const signBox = (x: number, title: string, line1: string, line2: string, signedAt?: string | null) => {
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

    // Name / company
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(line1, x + 3, sigY + 13)
    doc.text(line2, x + 3, sigY + 18)

    // Constant signature + date fields
    doc.setDrawColor(120, 120, 120)
    doc.text('Signature:', x + 3, sigY + 28)
    doc.line(x + 22, sigY + 28, x + 84, sigY + 28)
    doc.text('Date:', x + 3, sigY + 34)
    doc.line(x + 16, sigY + 34, x + 50, sigY + 34)

    // Overlay digital confirmation on top of the fields when signed
    if (signedAt) {
      const d = new Date(signedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
      doc.setTextColor(...ACCENT)
      doc.setFont('helvetica', 'bold')
      doc.text('Digitally signed', x + 24, sigY + 27)
      doc.text(d, x + 18, sigY + 33)
      doc.setTextColor(30, 30, 30)
      doc.setFont('helvetica', 'normal')
    }
  }

  signBox(14,  'CONSULTANT',
    `Name: ${timesheet.consultant_name ?? ''}`,
    `Position: ${timesheet.position ?? ''}`,
    timesheet.consultant_signed_at)

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
