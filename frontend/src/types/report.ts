import type { AiLabel, AnomalyCode, ReportStatus } from './enums'

export interface OcrItemLine {
  invoiceItemName: string
  invoiceSpecModel: string
  unit: string
  purchaseQuantity: string
  lineAmount: string
  lineTaxAmount: string
}

export interface OcrResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  confidence: number
  invoiceNo: string
  invoiceDate: string
  buyerName: string
  buyerCreditCode: string
  sellerName: string
  sellerCreditCode: string
  totalTaxIncludedAmount: string
  totalAmount: string
  totalTaxAmount: string
  itemLines: OcrItemLine[]
}

export interface ReportItem {
  id: string
  invoiceItemName: string
  invoiceSpecModel: string
  productSpecificModel: string
  unit: string
  purchaseQuantity: string
  lineAmount: string
  lineTaxAmount: string
}

export interface Report {
  id: string
  ownerUserId: string
  status: ReportStatus
  aiLabel: AiLabel
  anomalyCodes: AnomalyCode[]
  invoiceImage: string
  ocr: OcrResult
  fields: {
    invoiceNo: string
    invoiceDate: string
    shipmentDate: string
    buyerName: string
    buyerCreditCode: string
    sellerName: string
    sellerCreditCode: string
    province: string
    prefectureCity: string
    city: string
    totalTaxIncludedAmount: string
    totalAmount: string
    totalTaxAmount: string
    remarks: string
  }
  items: ReportItem[]
  createdAt: string
  submittedAt?: string
}
