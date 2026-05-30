// ============================================================
// PDF Export Utilities — Timesheets & SARS Logbook
// ============================================================
// Uses jsPDF + jspdf-autotable.
// Client-side only — call from onClick handlers, not server routes.
// ============================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns'
import type { KlippaProfile, KlippaMileageTrip } from '@/lib/types'
import type { KlippaTimesheet, KlippaTimesheetEntry } from '@/lib/types'
import { getSAHolidayName } from '@/lib/sa-holidays'

// ── Shared helpers ────────────────────────────────────────

const EMERALD = [16, 185, 129] as [number, number, number]   // #10b981
const ZINC900 = [24,  24,  27] as [number, number, number]   // zinc-900
const ZINC700 = [63,  63,  70] as [number, number, number]   // zinc-700
const WHITE   = [255, 255, 255] as [number, number, number]

function fmtRand(n: number): string {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Timesheet PDF ─────────────────────────────────────────

export function exportTimesheetPDF(
  timesheet: KlippaTimesheet & { client_name?: string; client_contact?: string },
  entries:   KlippaTimesheetEntry[],
  options?:  { blob?: boolean },
): void | Blob {
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

  doc.setTextColor(...EMERALD)
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
      fillColor: EMERALD,
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

  // ── Footer summary ────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY + 8
  const billable = timesheet.hourly_rate ? totalHours * timesheet.hourly_rate : null

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.text(`Total Hours: ${totalHours}`, 14, finalY)
  if (billable !== null) {
    doc.text(`Billable Amount: ${fmtRand(billable)}`, 80, finalY)
  }

  // ── Sign-off section ──────────────────────────────────────
  const sigY = finalY + 10

  // Box outlines
  doc.setDrawColor(...ZINC700)
  doc.setLineWidth(0.3)
  doc.rect(14,  sigY, 87, 32)   // Consultant box
  doc.rect(109, sigY, 87, 32)   // Client box

  // Box headers
  doc.setFillColor(...ZINC900)
  doc.rect(14,  sigY, 87, 7, 'F')
  doc.rect(109, sigY, 87, 7, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('CONSULTANT',  17.5, sigY + 5)
  doc.text('CLIENT / AUTHORISED SIGNATORY', 112, sigY + 5)

  // Consultant box content
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(30, 30, 30)
  doc.text(`Name: ${timesheet.consultant_name ?? ''}`, 17, sigY + 13)
  doc.text(`Position: ${timesheet.position ?? ''}`,   17, sigY + 19)

  if (timesheet.consultant_signed_at) {
    const signDate = new Date(timesheet.consultant_signed_at)
      .toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.setTextColor(...EMERALD)
    doc.setFont('helvetica', 'bold')
    doc.text(`✓ Digitally confirmed: ${signDate}`, 17, sigY + 27)
  } else {
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal')
    doc.text('Signature: ____________________________', 17, sigY + 27)
    doc.text('Date: _______________',                   17, sigY + 33)
  }

  // Client box content
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(30, 30, 30)
  doc.text(`Name: ${timesheet.client_contact ?? ''}`,  112, sigY + 13)
  doc.text(`Company: ${timesheet.client_name ?? ''}`,  112, sigY + 19)

  if (timesheet.client_signed_at) {
    const clientDate = new Date(timesheet.client_signed_at)
      .toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.setTextColor(...EMERALD)
    doc.setFont('helvetica', 'bold')
    doc.text(`✓ Confirmed: ${clientDate}`, 112, sigY + 27)
  } else {
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal')
    doc.text('Signature: ____________________________', 112, sigY + 27)
    doc.text('Date: _______________',                   112, sigY + 33)
  }

  // ── Footer branding ───────────────────────────────────────
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.text('Generated by Klippa | klippa.co.za', 14, 290)

  const fileName = `Klippa_Timesheet_${timesheet.client_name ?? 'Client'}_${format(monthDate, 'yyyy-MM')}.pdf`
    .replace(/[^a-zA-Z0-9_.-]/g, '_')

  if (options?.blob) {
    return doc.output('blob')
  }
  doc.save(fileName)
}

// ── SARS Logbook PDF ──────────────────────────────────────

export function exportLogbookPDF(
  profile:  Pick<KlippaProfile,
    'full_name' | 'tax_number' | 'vehicle_make' | 'vehicle_model' | 'vehicle_year' |
    'vehicle_value' | 'vehicle_registration' | 'vehicle_purchase_date' |
    'opening_odometer' | 'closing_odometer'>,
  trips:    KlippaMileageTrip[],
  taxYear:  number,  // e.g. 2025 = year ending 28 Feb 2025
): void {
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

  doc.setTextColor(...EMERALD)
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
    headStyles: { fillColor: EMERALD, textColor: WHITE, fontStyle: 'bold' },
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
  doc.text('Generated by Klippa | klippa.co.za', 14, 205)

  doc.save(`Klippa_Logbook_${taxYear}.pdf`)
}
