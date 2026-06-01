import Link from 'next/link'
import { ShieldCheck, ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — Klippa',
  description: 'How Klippa collects, uses and protects your personal information under POPIA.',
}

export default function PrivacyPage() {
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
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-sm text-ink-3">Effective date: 1 June 2026 · Last updated: 1 June 2026</p>
        </div>

        <div className="space-y-10 text-sm text-ink-2 leading-relaxed">

          {/* Intro */}
          <section className="rounded-2xl border border-edge bg-surface/30 px-6 py-5 text-ink-2 text-sm leading-relaxed">
            Klippa is committed to protecting your personal information in accordance with the <strong className="text-ink-1">Protection of Personal Information Act 4 of 2013 (POPIA)</strong> and all applicable South African privacy legislation. This Policy explains what personal information we collect, why we collect it, how we use it and what rights you have.
          </section>

          {/* 1 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">1. Who We Are &amp; Our Responsible Party</h2>
            <p>Klippa (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is the responsible party for the personal information processed through the Klippa platform at klippa.co.za.</p>
            <p>Our designated Information Officer can be reached at <a href="mailto:privacy@klippa.co.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">privacy@klippa.co.za</a>. Any privacy-related requests, complaints or queries must be directed to this address.</p>
          </section>

          {/* 2 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">2. Information We Collect</h2>
            <p>We collect only the personal information necessary to provide the service. This includes:</p>

            <div className="space-y-4">
              <div className="rounded-xl border border-edge bg-surface/40 p-4 space-y-2">
                <p className="font-medium text-ink-1 text-xs uppercase tracking-wide">Account &amp; identity</p>
                <p>Your name, email address, South African ID number or passport number, tax reference number, date of birth, and contact details. This is required to create and maintain your account and to link records to the correct taxpayer.</p>
              </div>
              <div className="rounded-xl border border-edge bg-surface/40 p-4 space-y-2">
                <p className="font-medium text-ink-1 text-xs uppercase tracking-wide">Financial records</p>
                <p>Income, expense and deduction data you capture, including amounts, dates, categories, merchant names and descriptions. Receipt images and supporting documents you upload. Vehicle logbook entries. Timesheet records.</p>
              </div>
              <div className="rounded-xl border border-edge bg-surface/40 p-4 space-y-2">
                <p className="font-medium text-ink-1 text-xs uppercase tracking-wide">Tax profile</p>
                <p>Employment type, home office details, vehicle information, retirement annuity and pension contributions, medical aid membership, and your selected tax year.</p>
              </div>
              <div className="rounded-xl border border-edge bg-surface/40 p-4 space-y-2">
                <p className="font-medium text-ink-1 text-xs uppercase tracking-wide">Payment information</p>
                <p>Subscription plan and billing cycle. We do not store your bank account details. Payments are processed directly via a regulated payment provider and we receive only a transaction status notification.</p>
              </div>
              <div className="rounded-xl border border-edge bg-surface/40 p-4 space-y-2">
                <p className="font-medium text-ink-1 text-xs uppercase tracking-wide">Usage &amp; technical data</p>
                <p>Log data such as IP address, browser type, pages visited and actions taken within the platform. This is used solely for security monitoring, debugging and improving the service.</p>
              </div>
            </div>
          </section>

          {/* 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">3. How We Use Your Information</h2>
            <p>We process your personal information only for the following purposes:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'To create, manage and secure your account.',
                'To provide the core platform features: expense tracking, income recording, tax estimates, document storage, timesheets and mileage logbook.',
                'To power the AI-assisted features of the platform — calculations, categorisation suggestions and the in-app assistant — using your profile data to personalise responses.',
                'To process subscription payments and manage your plan.',
                'To send you transactional emails (account creation, payment confirmation, security alerts).',
                'To send optional product updates and tips. You may unsubscribe from these at any time.',
                'To comply with applicable South African law, including responding to valid legal orders.',
                'To detect, prevent and investigate fraud, abuse or security incidents.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 4 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">4. Legal Basis for Processing</h2>
            <p>Under POPIA, we process your personal information on the following lawful grounds:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                { title: 'Contractual necessity', body: 'Processing required to deliver the service you signed up for.' },
                { title: 'Consent', body: 'For optional communications such as product newsletters. You may withdraw consent at any time.' },
                { title: 'Legitimate interest', body: 'For security monitoring, fraud prevention and platform improvement, where these interests are not overridden by your rights.' },
                { title: 'Legal obligation', body: 'Where we are required to process or retain information to comply with applicable South African law.' },
              ].map(({ title, body }, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                  <span><span className="font-medium text-ink-1">{title}:</span> {body}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 5 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">5. Sharing of Personal Information</h2>
            <p>We do not sell, rent or trade your personal information to any third party.</p>
            <p>We share information only in the following limited circumstances:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'With sub-processors who help us deliver the service (such as cloud infrastructure, email delivery and payment processing providers). These parties are contractually bound to process data only on our instructions and to maintain appropriate security.',
                'Within an organisation or practice account you belong to — for example, your timesheet data is visible to your organisation\'s administrators.',
                'With law enforcement or regulatory authorities where we are legally required to do so.',
                'In connection with a business transfer (merger, acquisition or asset sale), in which case the acquiring party will be bound by this Policy.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 6 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">6. Cross-Border Transfers</h2>
            <p>Some of our sub-processors operate infrastructure outside South Africa. Where your personal information is transferred to a country that does not have equivalent data protection laws, we ensure appropriate safeguards are in place — including contractual clauses that impose POPIA-equivalent obligations on the receiving party — before any transfer takes place.</p>
          </section>

          {/* 7 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">7. Retention of Personal Information</h2>
            <p>We retain your personal information for as long as your account is active or as necessary to fulfil the purposes set out in this Policy.</p>
            <p>When you delete your account, all personal information — including uploaded documents and financial records — is permanently and irreversibly deleted from our systems. We do not retain copies after deletion.</p>
            <p>Where we are required by law to retain certain records (for example, payment records for tax purposes), we will retain only the minimum information necessary and for no longer than the legally required period.</p>
          </section>

          {/* 8 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">8. Your Rights under POPIA</h2>
            <p>As a data subject under South African law you have the right to:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                { title: 'Access', body: 'Request confirmation of whether we hold your personal information and obtain a copy of it.' },
                { title: 'Correction', body: 'Request that we correct inaccurate, incomplete or outdated information.' },
                { title: 'Deletion', body: 'Request deletion of your personal information. You can do this directly by deleting your account in Settings.' },
                { title: 'Objection', body: 'Object to the processing of your personal information where we are relying on legitimate interest as our basis.' },
                { title: 'Withdrawal of consent', body: 'Withdraw consent for optional communications at any time.' },
                { title: 'Complaint', body: 'Lodge a complaint with the Information Regulator of South Africa if you believe your rights have been violated.' },
              ].map(({ title, body }, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                  <span><span className="font-medium text-ink-1">{title}:</span> {body}</span>
                </li>
              ))}
            </ul>
            <p>To exercise any of these rights, contact our Information Officer at <a href="mailto:privacy@klippa.co.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">privacy@klippa.co.za</a>. We will respond within a reasonable time and no later than the period prescribed by POPIA.</p>
            <div className="rounded-xl border border-edge bg-surface/40 px-5 py-4 text-xs space-y-1">
              <p className="font-medium text-ink-1">Information Regulator of South Africa</p>
              <p>Website: <a href="https://www.justice.gov.za/inforeg" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">www.justice.gov.za/inforeg</a></p>
              <p>Email: <a href="mailto:inforeg@justice.gov.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">inforeg@justice.gov.za</a></p>
            </div>
          </section>

          {/* 9 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">9. Security</h2>
            <p>We implement appropriate technical and organisational measures to protect your personal information against unauthorised access, loss, alteration or destruction. These measures include encrypted data storage and transmission, access controls, session management and regular security reviews.</p>
            <p>No method of transmission or storage is completely secure. In the event of a data breach that is likely to result in a risk to your rights and freedoms, we will notify you and the Information Regulator as required by POPIA.</p>
          </section>

          {/* 10 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">10. Cookies &amp; Local Storage</h2>
            <p>Klippa uses cookies and browser local storage solely to maintain your authenticated session and to remember preferences within the platform. We do not use advertising cookies, cross-site tracking or analytics that share data with third-party advertising networks.</p>
          </section>

          {/* 11 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">11. Children</h2>
            <p>Klippa is not directed at children under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has created an account, please contact us immediately and we will delete the account.</p>
          </section>

          {/* 12 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">12. Changes to This Policy</h2>
            <p>We may update this Policy from time to time to reflect changes in the law, our practices or the service. Material changes will be communicated by email and/or a notice within the platform before the revised Policy takes effect. The date at the top of this page reflects when the Policy was last updated.</p>
          </section>

          {/* 13 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink-1">13. Contact</h2>
            <p>For privacy-related queries, access requests or complaints, contact our Information Officer:</p>
            <div className="rounded-xl border border-edge bg-surface/40 px-5 py-4 space-y-1 text-sm">
              <p className="font-medium text-ink-1">Klippa Information Officer</p>
              <p>Email: <a href="mailto:privacy@klippa.co.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">privacy@klippa.co.za</a></p>
              <p>General support: <a href="mailto:support@klippa.co.za" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">support@klippa.co.za</a></p>
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
            <Link href="/terms" className="hover:text-ink-2 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ink-2 transition-colors font-medium text-ink-2">Privacy</Link>
            <a href="mailto:support@klippa.co.za" className="hover:text-ink-2 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
