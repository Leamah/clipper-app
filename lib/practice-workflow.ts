import type {
  KlippaPracticeClient,
  KlippaPracticeReturn,
  PracticeQueueName,
  PracticeReadinessScore,
} from './types'

const FINAL_STATUSES = new Set(['filed', 'assessed'])

export function derivePracticeQueue(
  client: Pick<KlippaPracticeClient, 'tax_number'>,
  practiceReturn: Pick<KlippaPracticeReturn, 'filing_status' | 'client_signoff_at' | 'sars_reference'>,
  readiness: Pick<PracticeReadinessScore, 'label' | 'blockers'>,
): PracticeQueueName {
  if (practiceReturn.filing_status === 'assessed') return 'SARS follow-up'
  if (FINAL_STATUSES.has(practiceReturn.filing_status)) return 'Filed'
  if (!client.tax_number) return 'Needs triage'
  if (practiceReturn.filing_status === 'review' && !practiceReturn.client_signoff_at) return 'Ready to file'
  if (practiceReturn.filing_status === 'review' && practiceReturn.client_signoff_at && !practiceReturn.sars_reference) return 'Ready to file'
  if (practiceReturn.filing_status === 'in_progress' && readiness.blockers.length === 0) return 'Ready for review'
  if (practiceReturn.filing_status === 'not_started') return 'Needs triage'
  if (practiceReturn.filing_status === 'collecting' || readiness.label === 'Blocked') return 'Waiting on client'
  return 'Ready to prepare'
}
