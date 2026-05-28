// ============================================================
// Klippa Mixed-Use Expense Intelligence
// Deep SARS-specific reasoning for partially deductible expenses.
// This is the hardest real-world problem for the self-employed.
//
// CRITICAL: Only classifies expenses. Never generates tax totals.
// ============================================================

import OpenAI from 'openai'
import type { ExpenseCategory, ConfidenceLevel } from './types'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface MixedUseAnalysis {
  category:              ExpenseCategory
  is_mixed_use:          boolean
  business_pct:          number         // recommended claim %
  conservative_pct:      number         // safest defensible %
  aggressive_pct:        number         // maximum defensible %
  confidence:            ConfidenceLevel
  sars_rule:             string         // plain-English SARS rule that applies
  reasoning:             string         // why this specific % for this expense
  audit_risk:            ConfidenceLevel
  audit_triggers:        string[]       // what specifically SARS would query
  required_evidence:     string[]       // what to keep on file
  behavioral_tip:        string | null  // workflow or pattern advice
}

// ── Embedded SARS 2024/2025 knowledge base ────────────────
// Injected into every prompt so reasoning is consistent and auditable.
const SARS_KNOWLEDGE = `
SARS EXPENSE RULES 2024/2025 — APPLY THESE EXACTLY:

PHONE & MOBILE DATA (phone_internet):
- Section 11(a): deductible proportional to business use
- Benchmarks: 65% standard freelancer/contractor; up to 80% if phone is primarily work
- 100% is rarely accepted on a personal contract — SARS will query
- Evidence needed: last 3 months itemised bills, written business-use proportion
- Audit trigger: 100% claim, or amount > R1,500/month without justification

HOME INTERNET (phone_internet):
- Section 11(a): shared household connection is partially deductible
- Benchmark: 50% minimum, up to 65% for full-time WFH sole traders
- Dedicated work-only line: 100%
- Evidence: ISP invoice, proof home is primary place of business

CLIENT MEALS & ENTERTAINMENT (client_entertainment):
- Section 11(a) + SARS Interpretation Note 14: CAPPED AT 50% — hard SARS rule
- Solo meals (no clients present): 0% — SARS explicitly rejects
- Working alone at a coffee shop: 0% — not entertainment
- Evidence: receipt, names of clients present, business purpose noted
- Audit trigger: frequent entertainment without client names documented

VEHICLE & FUEL (vehicle_travel):
- Section 8(1)(b): REQUIRES a maintained logbook — no logbook = 0% no matter what
- Logbook must record: date, start/end odometer, km, business purpose, route
- Business % = business km ÷ total km × actual costs OR fixed SARS rate
- Fuel receipts alone are not sufficient — the logbook is what SARS asks for first
- Audit trigger: vehicle claims without a logbook; mixed personal/business with no split

COMPUTER, LAPTOP & ELECTRONICS (equipment):
- Section 11(e): write-off over useful life (typically 3 years) or immediate if < R7,000
- Exclusively for work: 100%
- Home laptop shared with family / personal use: 60-80% depending on actual use
- Gaming PC claimed as work equipment: SARS likely to deny without strong justification
- Evidence: purchase receipt, description of business use

ACCOMMODATION — BUSINESS TRAVEL (other/professional_fees):
- Section 11(a): 100% if travel purpose is entirely business
- Airbnb, hotel, guesthouse during confirmed business trip: fully deductible
- Mixed leisure + work trip: only count nights with confirmed business activity
- Evidence: booking confirmation, client meeting proof, travel itinerary

HOME ELECTRICITY & UTILITIES (home_office):
- Section 11(a): ONLY the home office percentage applies — never the whole bill
- Cannot claim full household electricity, even during load shedding
- Generator / inverter fuel: same home office % rules — not full amount
- Evidence: utility bills, floor plan showing office room % of total home

SOFTWARE & SUBSCRIPTIONS (software_subscriptions):
- Section 11(a): 100% if exclusively for work
- Streaming (Netflix, Showmax, DStv, Spotify): personal — 0%
- Productivity tools (Adobe, Figma, Slack, Zoom, GitHub, etc.): 100%
- Cloud storage used for work files: 100%; personal photos backup: 0-50%
- Evidence: subscription receipt, description of business use

COFFEE SHOP PURCHASES (client_entertainment or other):
- Meeting with client at coffee shop: 50% (entertainment rules apply)
- Working alone at coffee shop: 0% — SARS does not allow this deduction
- Team working session (no clients): 50% with documentation
- Evidence: receipt + names of attendees + business purpose

AIRBNB WHILE WORKING REMOTELY:
- Domestic workation (Airbnb in Cape Town while working remotely): 0% — this is accommodation, not travel
- Airbnb at a client's city for client work: 100% with documented business purpose
- Evidence: booking confirmation, emails confirming the business purpose of the trip

LOAD SHEDDING / GENERATOR COSTS:
- Generator purchase: home office % only (e.g. 15% of R8,000 = R1,200)
- Generator fuel: home office % only
- UPS/inverter setup: home office % only
- Cannot claim full cost — only the portion attributable to the work room
`

// ── Main analysis function ────────────────────────────────

export async function analyzeMixedUse(
  expense: {
    merchant_name: string
    amount:        number
    description?:  string
    expense_date?: string
  },
  profile: {
    employment_type:  string
    work_location:    string
    works_from_home:  boolean
    has_vehicle:      boolean
    home_office_pct:  number
  }
): Promise<MixedUseAnalysis> {

  const systemPrompt = `You are a South African tax advisor specialising in expense deductibility for self-employed people — freelancers, contractors, consultants, content creators, and sole traders.

You have deep knowledge of SARS rules. Below is the authoritative rule set to apply:

${SARS_KNOWLEDGE}

User profile:
- Work type: ${profile.employment_type}
- Work location: ${profile.work_location} (works from home: ${profile.works_from_home})
- Home office percentage: ${profile.home_office_pct}%
- Has vehicle: ${profile.has_vehicle}

TASK: Analyse this expense for mixed-use deductibility. Return a JSON object with:
{
  "category": "<one of: phone_internet|home_office|vehicle_travel|equipment|software_subscriptions|client_entertainment|professional_fees|training|marketing|bank_charges|insurance|stationery|other>",
  "is_mixed_use": <boolean — true if only partially deductible>,
  "business_pct": <0-100 — recommended claim percentage>,
  "conservative_pct": <0-100 — safest/most defensible percentage>,
  "aggressive_pct": <0-100 — maximum justifiable percentage>,
  "confidence": "<high|medium|low>",
  "sars_rule": "<one sentence — which SARS section and rule applies, in plain English>",
  "reasoning": "<2-3 sentences — why this specific percentage for this specific expense, referencing their profile>",
  "audit_risk": "<high|medium|low>",
  "audit_triggers": ["<specific thing SARS would flag>", ...],
  "required_evidence": ["<specific document/record to keep>", ...],
  "behavioral_tip": "<one sentence practical advice OR null>"
}

Be specific to the South African context. Name the actual section where relevant. Never invent deductions.`

  const userPrompt = `Analyse this expense:
Merchant / Description: ${expense.merchant_name}${expense.description ? ` — ${expense.description}` : ''}
Amount: R${expense.amount.toFixed(2)}
Date: ${expense.expense_date ?? 'unknown'}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model:           'gpt-4o-mini',
      max_tokens:      700,
      temperature:     0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    })

    const text = response.choices[0]?.message?.content ?? '{}'
    const raw  = JSON.parse(text)

    const category   = raw.category as ExpenseCategory
    const businessPct = Math.min(100, Math.max(0, raw.business_pct ?? 0))

    return {
      category,
      is_mixed_use:      raw.is_mixed_use ?? (businessPct > 0 && businessPct < 100),
      business_pct:      businessPct,
      conservative_pct:  Math.min(100, Math.max(0, raw.conservative_pct ?? businessPct)),
      aggressive_pct:    Math.min(100, Math.max(0, raw.aggressive_pct   ?? businessPct)),
      confidence:        (raw.confidence    as ConfidenceLevel) ?? 'medium',
      sars_rule:         raw.sars_rule      ?? '',
      reasoning:         raw.reasoning      ?? '',
      audit_risk:        (raw.audit_risk    as ConfidenceLevel) ?? 'medium',
      audit_triggers:    Array.isArray(raw.audit_triggers)    ? raw.audit_triggers    : [],
      required_evidence: Array.isArray(raw.required_evidence) ? raw.required_evidence : [],
      behavioral_tip:    raw.behavioral_tip ?? null,
    }
  } catch {
    return {
      category:          'other',
      is_mixed_use:      false,
      business_pct:      0,
      conservative_pct:  0,
      aggressive_pct:    0,
      confidence:        'low',
      sars_rule:         'Could not determine the applicable SARS rule.',
      reasoning:         'Analysis failed. Please classify this expense manually.',
      audit_risk:        'medium',
      audit_triggers:    [],
      required_evidence: ['Keep the original receipt'],
      behavioral_tip:    null,
    }
  }
}

// ── Batch version ─────────────────────────────────────────
export async function analyzeMixedUseBatch(
  expenses: Parameters<typeof analyzeMixedUse>[0][],
  profile:  Parameters<typeof analyzeMixedUse>[1]
): Promise<MixedUseAnalysis[]> {
  const results: MixedUseAnalysis[] = []
  for (let i = 0; i < expenses.length; i += 3) {
    const batch = expenses.slice(i, i + 3)
    const batchResults = await Promise.all(
      batch.map((e) => analyzeMixedUse(e, profile).catch(() => ({
        category:          'other' as ExpenseCategory,
        is_mixed_use:      false,
        business_pct:      0,
        conservative_pct:  0,
        aggressive_pct:    0,
        confidence:        'low' as ConfidenceLevel,
        sars_rule:         'Analysis failed.',
        reasoning:         'Please classify manually.',
        audit_risk:        'medium' as ConfidenceLevel,
        audit_triggers:    [],
        required_evidence: [],
        behavioral_tip:    null,
      })))
    )
    results.push(...batchResults)
  }
  return results
}
