// ============================================================
// Receipt & document OCR — powered by OpenAI GPT-4o-mini vision
// Replaced original Mathpix integration (math-OCR, not receipt OCR)
// with GPT-4o-mini which is already configured for the chatbot and
// handles SA receipt formats reliably.
// ============================================================

import OpenAI from 'openai'

interface MathpixResult {
  text:             string
  confidence:       number
  extracted_fields: Record<string, string | number | null>
}

interface MathpixOptions {
  document_type: 'receipt' | 'irp5' | 'bank_statement' | 'general'
}

export async function extractDocument(
  base64Image: string,
  mimeType:    string,
  options:     MathpixOptions,
): Promise<MathpixResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = buildPrompt(options.document_type)

  const response = await openai.chat.completions.create({
    model:    'gpt-4o-mini',
    messages: [
      {
        role:    'user',
        content: [
          { type: 'text',      text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'auto' } },
        ],
      },
    ],
    max_tokens:      400,
    response_format: { type: 'json_object' },
  })

  const raw  = response.choices[0]?.message?.content ?? '{}'
  let extracted_fields: Record<string, string | number | null> = {}
  try { extracted_fields = JSON.parse(raw) } catch { /* malformed JSON — leave empty */ }

  return {
    text:             raw,
    confidence:       0.85,
    extracted_fields,
  }
}

// ── Prompt builders ───────────────────────────────────────

function buildPrompt(documentType: MathpixOptions['document_type']): string {
  if (documentType === 'receipt') {
    return `You are an OCR assistant reading a South African receipt or tax invoice.
Extract the following fields and respond with valid JSON only — no explanation, no markdown.
Use null for any field you cannot find. Amounts are in South African Rand (R / ZAR).

{
  "merchant_name": "store or business name (string or null)",
  "amount": <total amount as a plain number, e.g. 349.99, or null>,
  "date": "date in DD/MM/YYYY format or null",
  "vat_amount": <VAT amount as a plain number or null>
}`
  }

  if (documentType === 'irp5') {
    return `You are an OCR assistant reading a South African IRP5 tax certificate.
Extract all SARS source codes and their amounts plus the employer name and tax year.
Respond with valid JSON only — no explanation, no markdown.
Format: { "employer_name": "...", "tax_year": 2026, "sars_3601": 480000, "sars_4001": 22000, ... }
Use null for fields you cannot find. Amounts are numbers only (no R or commas).`
  }

  return `Extract the key fields from this document and respond with valid JSON only.`
}
