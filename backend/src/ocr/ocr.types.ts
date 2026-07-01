export interface OcrItemLine {
  invoiceItemName: string
  invoiceSpecModel: string
  unit: string
  purchaseQuantity: string
  lineAmount: string
  lineTaxAmount: string
}

export interface OcrInvoiceResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  confidence: number
  invoiceNo: string
  invoiceDate: string
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
  itemLines: OcrItemLine[]
}

export interface OcrInputFile {
  originalName: string
  mimeType: string
  size: number
  buffer: Buffer
}

export interface OcrProvider {
  recognizeInvoice(file: OcrInputFile): Promise<OcrInvoiceResult>
}
