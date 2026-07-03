/** Recurring template helpers — shared by API routes and cron. */

/** Next occurrence of day_of_month strictly after `from` (UTC date string) */
export function nextRunDate(dayOfMonth: number, from = new Date()): string {
  const y = from.getFullYear()
  const m = from.getMonth()
  const candidate = new Date(Date.UTC(y, m, dayOfMonth))
  const today     = new Date(Date.UTC(y, m, from.getDate()))
  const next = candidate > today ? candidate : new Date(Date.UTC(y, m + 1, dayOfMonth))
  return next.toISOString().slice(0, 10)
}

/** The run after an existing next_run date (advance one month, same day) */
export function advanceRunDate(currentRun: string, dayOfMonth: number): string {
  const d = new Date(`${currentRun}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, dayOfMonth)).toISOString().slice(0, 10)
}
