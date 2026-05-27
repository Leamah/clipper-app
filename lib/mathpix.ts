// ============================================================
// Mathpix OCR client for Klippa
// Used for: receipts, IRP5/IT3 certificates, bank statements
// ============================================================

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
  mimeType: string,
  options: MathpixOptions
): Promise<MathpixResult> {
  const appId  = process.env.MATHPIX_APP_ID!
  const appKey = process.env.MATHPIX_APP_KEY!

  const body = {
    src:                  `data:${mimeType};base64,${base64Image}`,
    formats:              ['text', 'data'],
    data_options:         { include_tables_html: true },
    ocr:                  ['math', 'text'],
  }

  const response = await fetch('https://api.mathpix.com/v3/text', {
    method:  'POST',
    headers: {
      'app_id':       appId,
      'app_key':      appKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Mathpix API error: ${response.status}`)
  }

  const raw = await response.json()
  const fullText: string = raw.text ?? ''

  let extracted_fields: Record<string, string | number | null> = {}

  if (options.document_type === 'irp5') {
    extracted_fields = parseIRP5Fields(fullText)
  } else if (options.document_type === 'receipt') {
    extracted_fields = parseReceiptFields(fullText)
  } else if (options.document_type === 'bank_statement') {
    extracted_fields = parseBankStatementFields(fullText)
  }

  // Confidence: Mathpix returns latex_confidence or text_confidence (0-1)
  const confidence = raw.latex_confidence ?? raw.text_confidence ?? 0.5

  return {
    text:             fullText,
    confidence:       confidence,
    extracted_fields,
  }
}

// ── IRP5 field extraction ─────────────────────────────────
// Maps SARS source codes found in OCR text to structured fields

function parseIRP5Fields(text: string): Record<string, string | number | null> {
  const fields: Record<string, string | number | null> = {}

  // Common IRP5 source codes
  const codes = [
    '3601', '3602', '3605', '3606', '3610', '3616', '3699',  // income
    '4001', '4002', '4003', '4005', '4006',                   // deductions
    '4101', '4102', '4115', '4116',                           // employees' tax
    '4141', '4150',                                            // medical aid
  ]

  for (const code of codes) {
    // Try to find "3601 R 123,456.00" or "3601: 123456" patterns
    const patterns = [
      new RegExp(`${code}[\\s:,]*R?\\s*([\\d,]+(?:\\.\\d{1,2})?)`, 'i'),
      new RegExp(`${code}[\\s]*([\\d]+[\\d,\\.]*)`),
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const raw = match[1].replace(/,/g, '')
        const value = parseFloat(raw)
        if (!isNaN(value)) {
          fields[`sars_${code}`] = value
          break
        }
      }
    }
  }

  // Extract employer name
  const employerMatch = text.match(/employer[:\s]+([A-Za-z\s&()\-]+)/i)
  if (employerMatch) fields['employer_name'] = employerMatch[1].trim()

  // Extract tax year
  const yearMatch = text.match(/tax year[:\s]*(\d{4})/i) ?? text.match(/period[:\s]*(\d{4})/i)
  if (yearMatch) fields['tax_year'] = parseInt(yearMatch[1])

  return fields
}

// ── Receipt field extraction ──────────────────────────────

function parseReceiptFields(text: string): Record<string, string | number | null> {
  const fields: Record<string, string | number | null> = {}

  // Total amount
  const totalPatterns = [
    /total[:\s]*R?\s*([\d,]+\.?\d*)/i,
    /amount[:\s]*R?\s*([\d,]+\.?\d*)/i,
    /grand total[:\s]*R?\s*([\d,]+\.?\d*)/i,
  ]
  for (const pattern of totalPatterns) {
    const match = text.match(pattern)
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(value)) { fields['amount'] = value; break }
    }
  }

  // Date
  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/
  const dateMatch = text.match(datePattern)
  if (dateMatch) fields['date'] = dateMatch[1]

  // VAT
  const vatPattern = /VAT[:\s]*R?\s*([\d,]+\.?\d*)/i
  const vatMatch = text.match(vatPattern)
  if (vatMatch) {
    const value = parseFloat(vatMatch[1].replace(/,/g, ''))
    if (!isNaN(value)) fields['vat_amount'] = value
  }

  // First line often contains merchant/store name
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines[0]) fields['merchant_name'] = lines[0].substring(0, 100)

  return fields
}

// ── Bank statement field extraction ──────────────────────

function parseBankStatementFields(text: string): Record<string, string | number | null> {
  const fields: Record<string, string | number | null> = {}

  // Account number
  const accMatch = text.match(/account[:\s]*(?:no\.?\s*)?(\d[\d\s]{6,15}\d)/i)
  if (accMatch) fields['account_number'] = accMatch[1].replace(/\s/g, '')

  // Period
  const periodMatch = text.match(/(?:statement period|from)[:\s]*(\d{1,2}[\/\-]\w+[\/\-]\d{2,4})/i)
  if (periodMatch) fields['period'] = periodMatch[1]

  return fields
}
