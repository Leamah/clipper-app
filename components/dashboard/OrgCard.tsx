'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'

/** Placement workspace card — org-invited consultants only. Unchanged from the pre-redesign dashboard. */
export default function OrgCard({ orgName, latestTsStatus }: {
  orgName:        string
  latestTsStatus: string | null
}) {
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-1 truncate">{orgName}</p>
          <p className="text-xs text-ink-2">Placement workspace</p>
          {latestTsStatus && (
            <span className={`mt-1 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              latestTsStatus === 'approved'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : latestTsStatus === 'submitted'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-raised text-ink-2'
            }`}>
              {latestTsStatus === 'approved'  ? 'Last TS approved'
               : latestTsStatus === 'submitted' ? 'Awaiting review'
               : latestTsStatus === 'draft'    ? 'Draft in progress'
               : latestTsStatus}
            </span>
          )}
        </div>
      </div>
      <Link
        href="/timesheets"
        className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
      >
        View timesheets
      </Link>
    </div>
  )
}
