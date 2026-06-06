import type {
  FilingStatus,
  KlippaPracticeClient,
  KlippaPracticeClientDocument,
  PracticeReadinessItem,
  PracticeReadinessScore,
} from './types'

type LinkedReturnSnapshot = {
  status?: string | null
  gross_income?: number | null
  total_deductions?: number | null
  taxable_income?: number | null
  net_tax_payable?: number | null
  sars_reference?: string | null
  submitted_at?: string | null
} | null

const FINAL_STATUSES: FilingStatus[] = ['filed', 'assessed']

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n))
}

function daysUntil(date: string | null) {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
}

function item(id: string, label: string, status: PracticeReadinessItem['status'], detail?: string): PracticeReadinessItem {
  return { id, label, status, detail }
}

function statusPoints(status: FilingStatus) {
  return {
    not_started: 0,
    collecting: 6,
    in_progress: 13,
    review: 20,
    filed: 25,
    assessed: 25,
  }[status]
}

export function calculatePracticeReadiness(
  client: KlippaPracticeClient,
  documents: KlippaPracticeClientDocument[] = [],
  linkedReturn: LinkedReturnSnapshot = null,
): PracticeReadinessScore {
  const blockers: PracticeReadinessItem[] = []
  const warnings: PracticeReadinessItem[] = []
  const next_actions: PracticeReadinessItem[] = []

  const checklist = Array.isArray(client.doc_checklist) ? client.doc_checklist : []
  const received = checklist.filter(d => d.received).length
  const docRatio = checklist.length > 0 ? received / checklist.length : 0
  const unmatchedUploads = documents.filter(d => !d.checklist_item_id).length

  let documentsScore = Math.round(docRatio * 35)
  if (checklist.length === 0) {
    blockers.push(item('documents.no_checklist', 'Build the document checklist', 'blocker', 'No required documents have been defined for this return.'))
    next_actions.push(item('documents.add_checklist', 'Add required documents for the return type', 'blocker'))
  } else if (received < checklist.length) {
    blockers.push(item('documents.missing', 'Collect missing documents', 'blocker', `${received}/${checklist.length} checklist items received.`))
    next_actions.push(item('documents.chase_client', 'Send or resend the upload portal link', 'blocker'))
  }
  if (unmatchedUploads > 0) {
    documentsScore = clamp(documentsScore + Math.min(unmatchedUploads, 3), 0, 35)
    warnings.push(item('documents.unmatched', 'Review unmatched uploads', 'warn', `${unmatchedUploads} upload${unmatchedUploads === 1 ? '' : 's'} not tied to a checklist item.`))
  }

  const dl = daysUntil(client.deadline)
  let deadlineScore = 0
  if (FINAL_STATUSES.includes(client.filing_status)) {
    deadlineScore = 15
  } else if (!client.deadline) {
    deadlineScore = 4
    warnings.push(item('deadline.missing', 'Set a filing deadline', 'warn'))
    next_actions.push(item('deadline.set', 'Add the SARS/client deadline', 'warn'))
  } else if (dl != null && dl < 0) {
    blockers.push(item('deadline.overdue', 'Deadline is overdue', 'blocker', `${Math.abs(dl)} day${Math.abs(dl) === 1 ? '' : 's'} overdue.`))
  } else if (dl != null && dl <= 7) {
    deadlineScore = 6
    warnings.push(item('deadline.close', 'Deadline is within 7 days', 'warn', dl === 0 ? 'Due today.' : `${dl} day${dl === 1 ? '' : 's'} remaining.`))
  } else if (dl != null && dl <= 14) {
    deadlineScore = 10
    warnings.push(item('deadline.soon', 'Deadline is within 14 days', 'warn', `${dl} days remaining.`))
  } else {
    deadlineScore = 15
  }

  let identityScore = 0
  if (client.tax_number) identityScore += 5
  else {
    blockers.push(item('identity.tax_number', 'Add tax number', 'blocker'))
    next_actions.push(item('identity.collect_tax_number', 'Collect the client tax number', 'blocker'))
  }
  if (client.email) identityScore += 3
  else warnings.push(item('identity.email', 'Add client email for portal follow-ups', 'warn'))
  if (client.portal_enabled && client.portal_token) identityScore += 2
  else warnings.push(item('identity.portal', 'Enable the client upload portal', 'warn'))

  const workflowScore = statusPoints(client.filing_status)
  if (client.filing_status === 'not_started') {
    next_actions.push(item('workflow.start', 'Move the return into document collection', 'warn'))
  }

  let reviewScore = 0
  if (FINAL_STATUSES.includes(client.filing_status)) {
    reviewScore = 15
  } else if (client.filing_status === 'review') {
    reviewScore = 11
    next_actions.push(item('review.approval', 'Get client approval before filing', 'warn'))
  } else if (client.filing_status === 'in_progress' && received === checklist.length && checklist.length > 0) {
    reviewScore = 8
    next_actions.push(item('review.prepare', 'Prepare review pack from received documents', 'warn'))
  } else if (linkedReturn) {
    reviewScore = 6
  }
  if (!linkedReturn && !FINAL_STATUSES.includes(client.filing_status)) {
    warnings.push(item('review.no_snapshot', 'No linked Klippa return snapshot yet', 'warn'))
  }

  const checks = {
    documents: documentsScore,
    deadline:  deadlineScore,
    identity:  identityScore,
    workflow:  workflowScore,
    review:    reviewScore,
  }

  const score = clamp(Object.values(checks).reduce((sum, n) => sum + n, 0))
  const label: PracticeReadinessScore['label'] =
    blockers.length > 0 || score < 50 ? 'Blocked'
    : score < 75 ? 'At risk'
    : score < 90 ? 'Nearly ready'
    : 'Ready'

  return { score, label, blockers, warnings, next_actions: next_actions.slice(0, 5), checks }
}
