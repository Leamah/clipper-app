import { escapeHtml, getSiteUrl } from './security'
import type { ChecklistItem, ClientEntityType, ClientReturnType } from './types'

export const DEFAULT_PRACTICE_TEMPLATES: Array<{
  name: string
  return_type: ClientReturnType
  entity_type: ClientEntityType | null
  description: string
  reminder_cadence_days: number
  checklist: ChecklistItem[]
}> = [
  {
    name: 'Salary ITR12',
    return_type: 'ITR12',
    entity_type: 'individual',
    description: 'Employees with salary income, medical aid, RA, and interest certificates.',
    reminder_cadence_days: 5,
    checklist: [
      { id: 'itr12-irp5', label: 'IRP5 / IT3(a)', received: false },
      { id: 'itr12-bank', label: 'Bank interest certificates', received: false },
      { id: 'itr12-medical', label: 'Medical aid tax certificate', received: false },
      { id: 'itr12-ra', label: 'RA / pension contribution certificate', received: false },
      { id: 'itr12-id', label: 'ID copy and proof of address', received: false },
    ],
  },
  {
    name: 'Provisional taxpayer ITR12',
    return_type: 'ITR12',
    entity_type: 'sole_prop',
    description: 'Freelancers or sole props with business expenses and supporting records.',
    reminder_cadence_days: 4,
    checklist: [
      { id: 'prov-income', label: 'Income summary or bank statement export', received: false },
      { id: 'prov-expenses', label: 'Expense support and receipts', received: false },
      { id: 'prov-logbook', label: 'Vehicle logbook or mileage evidence', received: false },
      { id: 'prov-medical', label: 'Medical aid / insurance certificates', received: false },
      { id: 'prov-id', label: 'Tax number and SARS correspondence', received: false },
    ],
  },
  {
    name: 'Company ITR14',
    return_type: 'ITR14',
    entity_type: 'company',
    description: 'Core annual company tax pack for SMEs.',
    reminder_cadence_days: 7,
    checklist: [
      { id: 'itr14-afs', label: 'Annual financial statements', received: false },
      { id: 'itr14-trial', label: 'Trial balance / ledger export', received: false },
      { id: 'itr14-bank', label: 'Bank confirmations and interest certificates', received: false },
      { id: 'itr14-dividends', label: 'Dividend / loan account schedules', received: false },
      { id: 'itr14-cor', label: 'CIPC / company registration documents', received: false },
    ],
  },
]

export function buildPracticeReminderEmail(input: {
  clientName: string
  orgName: string
  portalUrl: string
  returnLabel: string
  checklist: ChecklistItem[]
}) {
  const safeClientName = escapeHtml(input.clientName)
  const safeOrgName = escapeHtml(input.orgName)
  const safeReturn = escapeHtml(input.returnLabel)
  const outstanding = input.checklist.filter(item => !item.received).slice(0, 8)
  const safePortal = `${getSiteUrl().replace(/\/$/, '')}${input.portalUrl.startsWith('http') ? '' : ''}`
  const listHtml = outstanding.length > 0
    ? `<ul style="margin:12px 0 0;padding-left:18px;color:#d4d4d8;font-size:14px;line-height:1.8;">${outstanding.map(item => `<li>${escapeHtml(item.label)}</li>`).join('')}</ul>`
    : `<p style="margin:12px 0 0;color:#d4d4d8;font-size:14px;line-height:1.8;">Please review the portal for the latest outstanding items.</p>`

  return `<!DOCTYPE html><html><body style="margin:0;background:#0f0f0f;font-family:-apple-system,Segoe UI,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 16px;"><tr><td align="center">
      <table width="100%" style="max-width:560px;background:#18181b;border-radius:18px;border:1px solid #27272a;overflow:hidden;">
        <tr><td style="padding:24px 32px;background:#d97706;color:#fff;font-size:16px;font-weight:700;">${safeOrgName}</td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;color:#f4f4f5;font-size:20px;font-weight:700;">Document reminder for ${safeReturn}</p>
          <p style="margin:0 0 8px;color:#d4d4d8;font-size:14px;line-height:1.8;">Hi ${safeClientName},</p>
          <p style="margin:0;color:#d4d4d8;font-size:14px;line-height:1.8;">${safeOrgName} is still waiting for the remaining items below so they can move your return forward.</p>
          ${listHtml}
          <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;"><tr><td style="background:#d97706;border-radius:10px;">
            <a href="${input.portalUrl}" style="display:inline-block;padding:13px 26px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Open secure portal</a>
          </td></tr></table>
          <p style="margin:18px 0 0;color:#a1a1aa;font-size:12px;line-height:1.7;">This link is private to you and does not require a password.</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`
}
