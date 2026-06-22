import type { Metadata } from 'next'
import DeductionsLanding from './DeductionsLanding'

export const metadata: Metadata = {
  title: 'What Can Freelancers Claim in South Africa?',
  description:
    'Stop guessing what SARS lets you claim. Klippa gives you the exact deductible percentage for your phone, laptop, home office and vehicle — with the SARS reasoning and audit evidence to back it up.',
  alternates: { canonical: '/deductions' },
}

export default function DeductionsPage() {
  return <DeductionsLanding />
}
