import { describe, expect, it } from 'vitest'
import { evaluateAiRules } from '../src/reports/ai-label.rules'

const recognized = {
  buyerCreditCode: 'BUYER-CODE',
  sellerCreditCode: 'SELLER-CODE',
  totalTaxIncludedAmount: '104,400.00'
}

describe('evaluateAiRules', () => {
  it('returns normal when submitted key fields match OCR', () => {
    expect(evaluateAiRules({
      ocrStatus: 'SUCCESS',
      ocrFields: recognized,
      submittedFields: recognized,
      duplicateInvoice: false
    })).toEqual({ aiLabel: '正常', anomalyCodes: [] })
  })

  it('marks OCR failure', () => {
    const result = evaluateAiRules({
      ocrStatus: 'FAILED',
      ocrFields: {},
      submittedFields: {},
      duplicateInvoice: false
    })

    expect(result.aiLabel).toBe('异常')
    expect(result.anomalyCodes).toContain('OCR_FAILED')
  })

  it('marks manually filled buyer credit code when OCR value is empty', () => {
    const result = evaluateAiRules({
      ocrStatus: 'PARTIAL',
      ocrFields: { ...recognized, buyerCreditCode: '' },
      submittedFields: recognized,
      duplicateInvoice: false
    })

    expect(result.anomalyCodes).toEqual([
      'OCR_BUYER_CODE_NOT_RECOGNIZED_MANUAL_FILLED',
      'OCR_CODE_MANUAL_FILLED'
    ])
  })

  it('marks a modified tax-included amount', () => {
    const result = evaluateAiRules({
      ocrStatus: 'SUCCESS',
      ocrFields: recognized,
      submittedFields: { ...recognized, totalTaxIncludedAmount: '104401.00' },
      duplicateInvoice: false
    })

    expect(result.anomalyCodes).toContain('KEY_FIELD_MODIFIED')
  })

  it('marks a duplicate invoice', () => {
    const result = evaluateAiRules({
      ocrStatus: 'SUCCESS',
      ocrFields: recognized,
      submittedFields: recognized,
      duplicateInvoice: true
    })

    expect(result.anomalyCodes).toContain('DUPLICATE_INVOICE')
  })
})
