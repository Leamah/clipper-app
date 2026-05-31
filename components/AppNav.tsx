'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ShieldCheck, LayoutDashboard, TrendingUp, Receipt, FileText,
  Clock, Car, CalendarDays, ClipboardCheck, Settings, Users,
  Menu, X, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import UserNav       from '@/components/UserNav'
import ThemeToggle   from '@/components/ThemeToggle'
import { supabase } from '@/lib/supabase'

export type ActivePage =
  | 'dashboard'
  | 'income'
  | 'expenses'
  | 'documents'
  | 'provisional'
  | 'filing'
  | 'mileage'
  | 'timesheets'
  | 'settings'
  | 'pricing'
  | 'subscription'
  | 'org'

export interface FeatureFlags {
  timesheets:  boolean
  logbook:     boolean
  provisional: boolean
  is_org_user?: boolean   // company_owner | practitioner
}

interface AppNavProps {
  activePage:      ActivePage
  featureFlags?:   FeatureFlags
  logbookPending?: number
}

interface NavItem {
  page:    ActivePage
  href:    string
  icon:    LucideIcon
  label:   string
  badge?:  number
  divider?: boolean
}

const NAV_BASE   = 'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors'
const NAV_ACTIVE = `${NAV_BASE} text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 font-medium`
const NAV_IDLE   = `${NAV_BASE} text-ink-2 hover:text-ink-1 hover:bg-raised/50`

function navCls(page: ActivePage, active: ActivePage, collapsed: boolean) {
  const base = page === active ? NAV_ACTIVE : NAV_IDLE
  return collapsed ? `${base} justify-center px-0` : base
}

const DEFAULT_FLAGS: FeatureFlags = { timesheets: false, logbook: true, provisional: false, is_org_user: false }

export default function AppNav({
  activePage,
  featureFlags: propFlags,
  logbookPending = 0,
}: AppNavProps) {
  const [flags, setFlags]         = useState<FeatureFlags>(propFlags ?? DEFAULT_FLAGS)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (propFlags) { setFlags(propFlags); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('klippa_profiles')
        .select('feature_timesheets, feature_logbook, feature_provisional, user_type')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setFlags({
              timesheets:  data.feature_timesheets  ?? false,
              logbook:     data.feature_logbook     ?? true,
              provisional: data.feature_provisional ?? false,
              is_org_user: data.user_type === 'company_owner' || data.user_type === 'practitioner',
            })
          }
        })
    })
  }, [propFlags])

  // Restore collapsed preference (desktop only)
  useEffect(() => {
    if (localStorage.getItem('klippa_nav_collapsed') === '1') setCollapsed(true)
  }, [])

  // Drive the content offset used by .app-shell across every page
  useEffect(() => {
    document.documentElement.style.setProperty('--nav-w', collapsed ? '4rem' : '13rem')
  }, [collapsed])

  function toggleCollapse() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem('klippa_nav_collapsed', next ? '1' : '0')
      return next
    })
  }

  // Build the link set from active feature flags
  const items: NavItem[] = [
    { page: 'dashboard', href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { page: 'income',    href: '/income',    icon: TrendingUp,      label: 'Income' },
    { page: 'expenses',  href: '/expenses',  icon: Receipt,         label: 'Expenses' },
    { page: 'documents', href: '/documents', icon: FileText,        label: 'Documents' },
  ]
  if (flags.timesheets)  items.push({ page: 'timesheets', href: '/timesheets', icon: Clock,        label: 'Timesheets' })
  if (flags.logbook)     items.push({ page: 'mileage',    href: '/mileage',    icon: Car,          label: 'Mileage', badge: logbookPending })
  if (flags.provisional) items.push({ page: 'provisional', href: '/provisional', icon: CalendarDays, label: 'Provisional' })
  items.push({ page: 'filing', href: '/filing', icon: ClipboardCheck, label: 'File Return', divider: true })
  if (flags.is_org_user) items.push({ page: 'org' as ActivePage, href: '/org/dashboard', icon: Users, label: 'My Team', divider: true })

  function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
    return (
      <>
        {items.map(({ page, href, icon: Icon, label, badge, divider }) => (
          <div key={page} className={divider ? 'pt-2 mt-1 border-t border-edge/40' : ''}>
            <Link
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={navCls(page, activePage, collapsed)}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && badge ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold tabular-nums">
                  {badge}
                </span>
              ) : null}
            </Link>
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 z-40 bg-base/95 backdrop-blur border-b border-edge/60 flex items-center gap-3 px-4">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="p-1.5 -ml-1.5 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-raised/50 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-ink-1">Klippa</span>
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-base border-r border-edge/60 flex flex-col shadow-2xl">
            <div className="h-14 px-4 flex items-center justify-between border-b border-edge/60 flex-shrink-0">
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-semibold text-sm tracking-tight text-ink-1">Klippa</span>
              </Link>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-1.5 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-raised/50">
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
              <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="px-2 py-3 border-t border-edge/60 space-y-0.5">
              <Link href="/settings" onClick={() => setMobileOpen(false)} className={navCls('settings', activePage, false)}>
                <Settings className="w-4 h-4 shrink-0" /> Settings
              </Link>
              <div className="px-1 pt-1">
                <UserNav sidebar />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar ────────────────────────────────────────── */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-screen bg-base border-r border-edge/60 flex-col z-30 transition-[width] duration-200"
        style={{ width: collapsed ? '4rem' : '13rem' }}
      >
        {/* Logo + collapse toggle */}
        <div className={`h-14 flex items-center border-b border-edge/60 flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'px-4 justify-between'}`}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight text-ink-1">Klippa</span>
            </Link>
          )}
          <button
            onClick={toggleCollapse}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="p-1.5 rounded-lg text-ink-3 hover:text-ink-1 hover:bg-raised/50 transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <NavLinks collapsed={collapsed} />
        </nav>

        {/* Bottom: Settings, theme toggle + user */}
        <div className="px-2 py-3 border-t border-edge/60 space-y-0.5">
          <Link href="/settings" title={collapsed ? 'Settings' : undefined} className={navCls('settings', activePage, collapsed)}>
            <Settings className="w-4 h-4 shrink-0" /> {!collapsed && 'Settings'}
          </Link>
          {!collapsed && (
            <>
              <div className="flex items-center justify-between px-1 pt-1">
                <ThemeToggle />
              </div>
              <div className="px-1">
                <UserNav sidebar />
              </div>
            </>
          )}
          {collapsed && (
            <div className="flex justify-center pt-1">
              <ThemeToggle />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
