import type { Metadata } from 'next'
import './globals.css'
import PageTransition  from '@/components/PageTransition'
import IdleGuard       from '@/components/IdleGuard'
import FeedbackWidget  from '@/components/FeedbackWidget'
import TaxChatbot      from '@/components/TaxChatbot'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  'Klippa | SARS-Ready Tax & Expense Tracking for SA Freelancers',
    template: '%s | Klippa',
  },
  description:
    'Klippa is the South African tax app for freelancers, consultants and accountants. Auto-categorise expenses, calculate mixed-use deductions, generate a SARS-compliant mileage logbook, and file your ITR12 in minutes — audit-ready all year.',
  keywords: [
    'SARS tax app', 'South Africa freelancer tax', 'ITR12 filing', 'provisional tax',
    'expense tracking South Africa', 'mileage logbook SARS', 'tax deductions freelancer',
    'accountant practice management', 'eFiling helper', 'consultant tax',
  ],
  authors: [{ name: 'Klippa' }],
  creator: 'Klippa',
  applicationName: 'Klippa',
  alternates: { canonical: '/' },
  openGraph: {
    type:        'website',
    locale:      'en_ZA',
    url:         SITE_URL,
    siteName:    'Klippa',
    title:       'Klippa | SARS-Ready Tax & Expense Tracking for SA Freelancers',
    description:
      'Auto-categorise expenses, calculate mixed-use deductions, build a SARS-compliant logbook and file your ITR12 in minutes. Built for South African freelancers, consultants and accountants.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Klippa — SARS-ready tax for South African freelancers' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Klippa | SARS-Ready Tax for SA Freelancers',
    description: 'Know your tax position in real time. Auto deductions, SARS logbook, 20-minute ITR12 filing.',
    images:      ['/og.png'],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  category: 'finance',
}

// Structured data — helps Google understand the product (rich results eligibility)
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id':   `${SITE_URL}/#organization`,
      name:    'Klippa',
      url:     SITE_URL,
      logo:    `${SITE_URL}/og.png`,
      description: 'SARS-ready tax and expense tracking for South African freelancers, consultants and accountants.',
      areaServed: 'ZA',
    },
    {
      '@type': 'SoftwareApplication',
      name:    'Klippa',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      url:     SITE_URL,
      offers: {
        '@type': 'Offer',
        price:   '0',
        priceCurrency: 'ZAR',
        description: 'Free to start — no credit card required.',
      },
      featureList: [
        'AI expense classification', 'Mixed-use deductibility calculator',
        'SARS-compliant mileage logbook', 'Provisional tax planner',
        'ITR12 eFiling cheat sheet', 'Audit-ready evidence checklists',
      ],
      audience: { '@type': 'Audience', audienceType: 'South African freelancers, consultants and accountants' },
    },
  ],
}

// Prevent flash of wrong theme: reads localStorage before first paint
const themeScript = `(function(){
  var t = localStorage.getItem('klippa-theme') || 'dark';
  document.documentElement.classList.toggle('dark', t === 'dark');
})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-base text-ink-1 antialiased">
        <IdleGuard />
        <PageTransition>{children}</PageTransition>
        <FeedbackWidget />
        <TaxChatbot />
      </body>
    </html>
  )
}
