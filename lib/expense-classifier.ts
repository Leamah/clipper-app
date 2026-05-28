// ============================================================
// Klippa Expense Classifier — OpenAI API
// CRITICAL: Only classifies individual expenses.
//           Never generates tax totals or tax advice.
// ============================================================

import OpenAI from 'openai'
import type { ClassificationResult, ExpenseCategory, ConfidenceLevel, KlippaProfile } from './types'
import { CATEGORY_DEFAULT_DEDUCTIBLE_PCT } from './types'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

interface ExpenseInput {
  merchant_name: string
  amount:        number
  description?:  string
  expense_date?: string
}

export async function classifyExpense(
  expense: ExpenseInput,
  profile: Pick<KlippaProfile, 'employment_type' | 'works_from_home' | 'has_vehicle'>
): Promise<ClassificationResult> {
  const systemPrompt = `You are a South African tax expense classifier for Klippa, a tax filing platform.

User profile:
- Employment type: ${profile.employment_type}
- Works from home: ${profile.works_from_home ? 'Yes' : 'No'}
- Uses vehicle for work: ${profile.has_vehicle ? 'Yes' : 'No'}

CRITICAL RULES:
1. Only classify individual expense items — never calculate tax totals
2. Be practical and conservative (SARS scrutinises unusual deductions)
3. Client entertainment is limited to 50% deductible by SARS
4. Personal meals (no client) are NOT deductible
5. Phone/internet: use 65% business estimate if profile shows freelance
6. Home office is only valid if user works from home

Categories (use exact strings):
phone_internet | home_office | vehicle_travel | equipment | software_subscriptions |
client_entertainment | professional_fees | training | marketing | bank_charges |
insurance | stationery | other

Respond with valid JSON only — no explanation text outside JSON.`

  const userPrompt = `Classify this expense:
Merchant: ${expense.merchant_name}
Amount: R${expense.amount.toFixed(2)}
Description: ${expense.description || '(none)'}
Date: ${expense.expense_date || '(unknown)'}

Return JSON with these exact fields:
{
  "category": "<category string>",
  "deductible_percentage": <0-100>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one plain-English sentence explaining deductibility>",
  "audit_risk": "high" | "medium" | "low"
}`

  const response = await getOpenAI().chat.completions.create({
    model:       'gpt-4o-mini',
    max_tokens:  512,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''

  let parsed: {
    category:              string
    deductible_percentage: number
    confidence:            string
    reasoning:             string
    audit_risk:            string
  }

  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      category:              'other',
      deductible_percentage: 0,
      confidence:            'low',
      reasoning:             'Could not classify this expense automatically. Please review manually.',
      audit_risk:            'medium',
      suggested_claim:       0,
    }
  }

  const category = parsed.category as ExpenseCategory
  const deductPct = typeof parsed.deductible_percentage === 'number'
    ? Math.min(100, Math.max(0, parsed.deductible_percentage))
    : (CATEGORY_DEFAULT_DEDUCTIBLE_PCT[category] ?? 0)

  return {
    category,
    deductible_percentage: deductPct,
    confidence:   (parsed.confidence as ConfidenceLevel) ?? 'medium',
    reasoning:    parsed.reasoning ?? '',
    audit_risk:   (parsed.audit_risk as ConfidenceLevel) ?? 'medium',
    suggested_claim: Math.round((expense.amount * deductPct) / 100 * 100) / 100,
  }
}

// Batch classify for CSV import (max 5 concurrent)
export async function classifyExpenses(
  expenses: ExpenseInput[],
  profile: Pick<KlippaProfile, 'employment_type' | 'works_from_home' | 'has_vehicle'>
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = []
  const batchSize = 5

  for (let i = 0; i < expenses.length; i += batchSize) {
    const batch = expenses.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((e) => classifyExpense(e, profile).catch(() => ({
        category:              'other' as ExpenseCategory,
        deductible_percentage: 0,
        confidence:            'low' as ConfidenceLevel,
        reasoning:             'Classification failed. Please review manually.',
        audit_risk:            'medium' as ConfidenceLevel,
        suggested_claim:       0,
      })))
    )
    results.push(...batchResults)
  }

  return results
}
