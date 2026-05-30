// ============================================================
// South African Public Holidays
// ============================================================
// Pure TS — no runtime dependencies, no API calls.
// Easter dates computed via the Meeus/Jones/Butcher algorithm.
// Observed Monday rule: when a fixed holiday falls on Sunday,
// the following Monday is the public holiday.
// ============================================================

export interface SAHoliday {
  date:  string  // ISO date: 'YYYY-MM-DD'
  name:  string
  fixed: boolean // false for Easter-derived holidays
}

/** Compute Easter Sunday for a given year (Meeus/Jones/Butcher algorithm) */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Returns observed date: if holiday falls on Sunday, observe Monday */
function observed(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day)
  if (d.getDay() === 0) return fmt(addDays(d, 1)) // Sunday → Monday
  return fmt(d)
}

/**
 * Returns all South African public holidays for the given calendar year.
 * Results are sorted by date.
 */
export function getSAHolidays(year: number): SAHoliday[] {
  const easter = easterSunday(year)

  const fixed: Array<[number, number, string]> = [
    [1,  1,  "New Year's Day"],
    [3,  21, 'Human Rights Day'],
    [4,  27, 'Freedom Day'],
    [5,  1,  "Workers' Day"],
    [6,  16, 'Youth Day'],
    [8,  9,  "National Women's Day"],
    [9,  24, 'Heritage Day'],
    [12, 16, 'Day of Reconciliation'],
    [12, 25, 'Christmas Day'],
    [12, 26, 'Day of Goodwill'],
  ]

  const holidays: SAHoliday[] = fixed.map(([m, d, name]) => ({
    date:  observed(year, m, d),
    name,
    fixed: true,
  }))

  // Good Friday (2 days before Easter)
  holidays.push({
    date:  fmt(addDays(easter, -2)),
    name:  'Good Friday',
    fixed: false,
  })

  // Family Day (Easter Monday)
  holidays.push({
    date:  fmt(addDays(easter, 1)),
    name:  'Family Day',
    fixed: false,
  })

  return holidays.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Returns a Set of holiday ISO date strings for a given year — fast O(1) lookup.
 */
export function getSAHolidaySet(year: number): Map<string, string> {
  const map = new Map<string, string>()
  for (const h of getSAHolidays(year)) {
    map.set(h.date, h.name)
  }
  return map
}

/**
 * Check if a given ISO date string is a SA public holiday.
 * Returns the holiday name, or null if not a holiday.
 */
export function getSAHolidayName(isoDate: string): string | null {
  const year = parseInt(isoDate.slice(0, 4), 10)
  const map  = getSAHolidaySet(year)
  return map.get(isoDate) ?? null
}
