'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Plus, Receipt, FileText, FileSpreadsheet, Camera } from 'lucide-react'

/** The everyday actions — renders instantly, no data needed. */
export default function QuickActions({ showInvoices }: { showInvoices: boolean }) {
  const actions = [
    // Snap receipt first — capture is the habit the product lives or dies on
    { label: 'Snap receipt', href: '/expenses?capture=1', icon: <Camera className="w-3.5 h-3.5" /> },
    { label: 'Add income',  href: '/income?add=1',   icon: <Plus            className="w-3.5 h-3.5" /> },
    { label: 'Add expense', href: '/expenses?add=1', icon: <Receipt         className="w-3.5 h-3.5" /> },
    ...(showInvoices ? [{ label: 'New invoice', href: '/invoices', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> }] : []),
    { label: 'Upload doc',  href: '/documents?add=1', icon: <FileText       className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((item) => (
        <motion.div key={item.href} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
          <Link
            href={item.href}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-edge bg-surface/40 hover:border-emerald-500/30 hover:bg-surface text-xs font-medium text-ink-2 hover:text-ink-1 transition-all"
          >
            <span className="text-emerald-500">{item.icon}</span>
            {item.label}
          </Link>
        </motion.div>
      ))}
    </div>
  )
}
