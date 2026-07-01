import { Injectable } from '@nestjs/common'
import type { OcrInputFile, OcrInvoiceResult, OcrProvider } from './ocr.types'

@Injectable()
export class LocalMockOcrProvider implements OcrProvider {
  async recognizeInvoice(file: OcrInputFile): Promise<OcrInvoiceResult> {
    const normalizedName = file.originalName.toLowerCase()
    const result: OcrInvoiceResult = {
      status: 'SUCCESS',
      confidence: 0.96,
      invoiceNo: '26372000001613754263',
      invoiceDate: '2026-04-22',
      buyerName: '山东阳谷金泉化工有限公司',
      buyerCreditCode: '91371521665709110H',
      sellerName: '山东百诺冉合电子科技有限公司',
      sellerCreditCode: '91370102575583630J',
      province: '山东省',
      prefectureCity: '聊城市',
      city: '阳谷县',
      totalTaxIncludedAmount: '104400.00',
      totalAmount: '92389.38',
      totalTaxAmount: '12010.62',
      itemLines: [
        {
          invoiceItemName: '*电子计算机*电脑',
          invoiceSpecModel: '启天',
          unit: '套',
          purchaseQuantity: '1',
          lineAmount: '4778.76',
          lineTaxAmount: '621.24'
        },
        {
          invoiceItemName: '*电子计算机*电脑',
          invoiceSpecModel: '昭阳',
          unit: '套',
          purchaseQuantity: '13',
          lineAmount: '63274.34',
          lineTaxAmount: '8225.66'
        },
        {
          invoiceItemName: '*电子计算机*电脑',
          invoiceSpecModel: '开天',
          unit: '套',
          purchaseQuantity: '5',
          lineAmount: '24336.28',
          lineTaxAmount: '3163.72'
        }
      ]
    }

    if (normalizedName.includes('ocr-failed')) {
      return {
        ...result,
        status: 'FAILED',
        confidence: 0,
        invoiceNo: '',
        invoiceDate: '',
        buyerName: '',
        buyerCreditCode: '',
        sellerName: '',
        sellerCreditCode: '',
        province: '',
        prefectureCity: '',
        city: '',
        totalTaxIncludedAmount: '',
        totalAmount: '',
        totalTaxAmount: '',
        itemLines: [
          {
            invoiceItemName: '',
            invoiceSpecModel: '',
            unit: '',
            purchaseQuantity: '',
            lineAmount: '',
            lineTaxAmount: ''
          }
        ]
      }
    }

    if (normalizedName.includes('missing-buyer-code')) {
      result.buyerCreditCode = ''
      result.confidence = 0.82
    }

    if (normalizedName.includes('missing-seller-code')) {
      result.sellerCreditCode = ''
      result.confidence = 0.82
    }

    return result
  }
}
