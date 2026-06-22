import type { Metadata } from 'next'
import ProvisionalTaxLanding from './ProvisionalTaxLanding'

export const metadata: Metadata = {
  title: 'Provisional Tax Calculator for SA Freelancers',
  description:
    'Know what to set aside for SARS before IRP6 asks for it. Klippa shows your real Safe-to-Spend balance after tax, with an IRP6 deadline planner built in.',
  alternates: { canonical: '/provisional-tax' },
}

export default function ProvisionalTaxPage() {
  return <ProvisionalTaxLanding />
}
