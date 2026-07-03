'use client'

/** Per-section loading skeletons — the dashboard never blocks on a full-page spinner. */

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-raised/60 ${className ?? ''}`} />
}

export function HeroSkeleton() {
  return (
    <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-4">
      <Shimmer className="h-3 w-32" />
      <Shimmer className="h-10 w-48" />
      <div className="flex gap-6">
        <Shimmer className="h-4 w-40" />
        <Shimmer className="h-4 w-36" />
      </div>
    </div>
  )
}

export function RowSkeleton() {
  return (
    <div className="rounded-2xl border border-edge bg-surface/40 p-4 flex items-center gap-4">
      <Shimmer className="w-9 h-9 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3 w-40" />
        <Shimmer className="h-3 w-64" />
      </div>
    </div>
  )
}
