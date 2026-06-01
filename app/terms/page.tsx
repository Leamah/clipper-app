import Link from 'next/link'
import { ShieldCheck, ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Terms & Conditions — Klippa',
  description: 'Klippa Terms and Conditions of Service',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-base text-ink-1">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-emerald-600/[0.04] blur-[120px] rounded-full" />
      </div>

      {/* Nav */}
      <header className="relative z-30 border-b border-edge/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md shadow-emerald-900/40">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href="/login" className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink-1 transition-colors">
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16 pb-24">

        <div className="mb-10">
          <p className="text-xs text-ink-3 uppercase tracking-widest mb-3">Legal</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Terms &amp; Conditions</h1>
          <p className="text-sm text-ink-3">Effective date: 1 June 2026 · Last updated: 1 June 2026</p>
        </div>

        <div className="prose-klippa space-y-10 text-sm text-ink-2 leading-relaxed">

          {/* Preamble */}
          <section className="rounded-2xl border border-edge bg-surface/30 px-6 py-5 text-ink-2 text-sm leading-relaxed">
            Please read these Terms and Conditions carefully before using Klippa. By creating an account or using any part of the service you confirm that you have read, understood and agreed to be bound by these Terms. If you do not agree, you may not use the service.
          </section>

          {/* 1 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">1. Who We Are</h2>
            <p>Klippa is a South African software-as-a-service platform designed to help freelancers, consultants and self-employed individuals manage their tax affairs, track income and expenses, maintain records and prepare for SARS filing. The service is operated and provided by Klippa (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) and is accessible at klippa.co.za.</p>
          </section>

          {/* 2 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">2. Eligibility</h2>
            <p>You must be at least 18 years of age and a South African resident or taxpayer to use Klippa. By registering you confirm that all information you provide is accurate, current and complete and that you have the legal capacity to enter into a binding agreement.</p>
          </section>

          {/* 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">3. Your Account</h2>
            <p>You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. Notify us immediately at <a href="mailto:support@klippa.co.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">support@klippa.co.za</a> if you suspect unauthorised access. We will never ask for your password by email or phone.</p>
          </section>

          {/* 4 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">4. Subscription &amp; Payment</h2>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Klippa offers a free tier and paid subscription plans as described on the pricing page. Paid plans are billed monthly or annually as selected at checkout.',
                'All prices are quoted in South African Rand (ZAR) and are inclusive of VAT where applicable.',
                'Payment is processed via instant EFT. Your plan activates immediately upon confirmed payment.',
                'All payments are final and non-refundable. There are no partial-period or pro-rata refunds for any reason, including early cancellation.',
                'Cancelling your subscription downgrades your account to the Free tier with immediate effect. You do not lose access to data already captured.',
                'We reserve the right to change pricing at any time. Any change will be communicated at least 30 days in advance and will not affect the current billing period.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 5 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">5. Not Tax or Financial Advice</h2>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-amber-200/80 space-y-2">
              <p className="font-medium text-amber-300">Important disclaimer</p>
              <p>Klippa is a record-keeping and organisational tool. Nothing on the platform — including calculations, estimates, AI-generated responses, classification suggestions or any other output — constitutes tax advice, financial advice or legal advice.</p>
              <p>Klippa is not a registered tax practitioner, financial adviser or attorney. All figures are estimates based on information you provide and may not reflect your full tax position. You are solely responsible for the accuracy and completeness of your SARS filings. We strongly recommend consulting a registered tax practitioner for any filing or financial decisions.</p>
            </div>
          </section>

          {/* 6 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">6. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Use the service for any unlawful purpose, including tax evasion or misrepresentation of income or expenses to SARS.',
                'Attempt to gain unauthorised access to any part of the platform or another user\'s account.',
                'Upload or transmit malicious code, viruses or any material that could harm the platform or its users.',
                'Reproduce, distribute, sell or sublicence any part of the service without our written consent.',
                'Use automated means to scrape, crawl or extract data from the platform.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 7 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">7. Your Data</h2>
            <p>You own all financial records, documents and data you upload to Klippa. You grant us a limited licence to store, process and display that data solely to provide the service to you. We do not sell your data. Our full data practices are described in our <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Privacy Policy</Link>.</p>
            <p>When you delete your account, all your data is permanently removed from our systems. This action is irreversible.</p>
          </section>

          {/* 8 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">8. Service Availability</h2>
            <p>We aim to keep Klippa available at all times but cannot guarantee uninterrupted access. We may perform maintenance, updates or emergency patches that temporarily affect availability. We will endeavour to notify users in advance of planned downtime.</p>
            <p>We are not liable for any loss or inconvenience arising from service unavailability, including missed filing deadlines. You are responsible for maintaining your own backups of critical tax records.</p>
          </section>

          {/* 9 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">9. Intellectual Property</h2>
            <p>All intellectual property in the Klippa platform — including design, code, branding, content and features — is and remains the exclusive property of Klippa. These Terms do not grant you any rights in our intellectual property beyond the limited right to use the service as described herein.</p>
          </section>

          {/* 10 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">10. Limitation of Liability</h2>
            <p>To the maximum extent permitted by South African law, Klippa and its directors, employees and agents shall not be liable for any indirect, incidental, special, consequential or punitive damages, including loss of profits, data or business opportunities, arising out of or in connection with your use of the service.</p>
            <p>Our total aggregate liability to you for any claim arising out of or related to these Terms or the service shall not exceed the total subscription fees paid by you in the three months preceding the event giving rise to the claim.</p>
          </section>

          {/* 11 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">11. Termination</h2>
            <p>You may cancel your account at any time through the Settings page. We reserve the right to suspend or terminate your account without notice if we reasonably believe you have breached these Terms, engaged in fraudulent activity, or pose a security risk to the platform or other users.</p>
          </section>

          {/* 12 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">12. Changes to These Terms</h2>
            <p>We may update these Terms from time to time. Material changes will be communicated by email and/or a notice within the platform at least 14 days before taking effect. Continued use of the service after that date constitutes acceptance of the revised Terms. If you do not accept the revised Terms you must cancel your account before the effective date.</p>
          </section>

          {/* 13 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">13. Governing Law &amp; Disputes</h2>
            <p>These Terms are governed by and construed in accordance with the laws of the Republic of South Africa, including the Electronic Communications and Transactions Act 25 of 2002 and the Consumer Protection Act 68 of 2008 where applicable. Any dispute arising out of these Terms shall be subject to the exclusive jurisdiction of the South African courts.</p>
          </section>

          {/* 14 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">14. Contact Us</h2>
            <p>Questions about these Terms? Reach us at:</p>
            <div className="rounded-xl border border-edge bg-surface/40 px-5 py-4 space-y-1 text-sm">
              <p className="font-medium text-ink-1">Klippa</p>
              <p>Email: <a href="mailto:support@klippa.co.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">support@klippa.co.za</a></p>
              <p>Website: <a href="https://klippa.co.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">klippa.co.za</a></p>
            </div>
          </section>

        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-edge/40">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-ink-3">© 2026 Klippa. Built for South African taxpayers.</p>
          <div className="flex items-center gap-4 text-xs text-ink-3">
            <Link href="/terms" className="hover:text-ink-2 transition-colors font-medium text-ink-2">Terms</Link>
            <Link href="/privacy" className="hover:text-ink-2 transition-colors">Privacy</Link>
            <a href="mailto:support@klippa.co.za" className="hover:text-ink-2 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
