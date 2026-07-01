export interface AiRuleFields {
  buyerCreditCode?: unknown
  sellerCreditCode?: unknown
  totalTaxIncludedAmount?: unknown
}

export interface AiRuleInput {
  ocrStatus: string | null
  ocrFields: AiRuleFields | null
  submittedFields: AiRuleFields | null
  duplicateInvoice: boolean
}

export interface AiLabelResult {
  aiLabel: '正常' | '异常'
  anomalyCodes: string[]
}

export function evaluateAiRules(input: AiRuleInput): AiLabelResult {
  const codes = new Set<string>()
  const raw = input.ocrFields
  const fields = input.submittedFields

  if (input.ocrStatus === 'FAILED') {
    codes.add('OCR_FAILED')
  }

  if (raw) {
    if (!normalizeValue(raw.buyerCreditCode) && normalizeValue(fields?.buyerCreditCode)) {
      codes.add('OCR_BUYER_CODE_NOT_RECOGNIZED_MANUAL_FILLED')
      codes.add('OCR_CODE_MANUAL_FILLED')
    }

    if (!normalizeValue(raw.sellerCreditCode) && normalizeValue(fields?.sellerCreditCode)) {
      codes.add('OCR_SELLER_CODE_NOT_RECOGNIZED_MANUAL_FILLED')
      codes.add('OCR_CODE_MANUAL_FILLED')
    }

    if (
      normalizeValue(raw.totalTaxIncludedAmount) &&
      normalizeValue(fields?.totalTaxIncludedAmount) &&
      !sameAmount(raw.totalTaxIncludedAmount, fields?.totalTaxIncludedAmount)
    ) {
      codes.add('KEY_FIELD_MODIFIED')
    }
  }

  if (input.duplicateInvoice) {
    codes.add('DUPLICATE_INVOICE')
  }

  const anomalyCodes = [...codes]
  return {
    aiLabel: anomalyCodes.length > 0 ? '异常' : '正常',
    anomalyCodes
  }
}

function sameAmount(left: unknown, right: unknown) {
  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)

  if (leftNumber !== null && rightNumber !== null) {
    return Math.abs(leftNumber - rightNumber) < 0.005
  }

  return normalizeValue(left) === normalizeValue(right)
}

function toNumber(value: unknown) {
  const normalized = normalizeValue(value)
  if (!normalized) return null

  const number = Number(normalized.replace(/,/g, ''))
  return Number.isFinite(number) ? number : null
}

function normalizeValue(value: unknown) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}
