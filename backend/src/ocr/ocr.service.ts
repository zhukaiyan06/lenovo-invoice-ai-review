import { Inject, Injectable } from '@nestjs/common'
import { LocalMockOcrProvider } from './local-mock-ocr.provider'
import type { OcrInputFile } from './ocr.types'

@Injectable()
export class OcrService {
  constructor(@Inject(LocalMockOcrProvider) private readonly provider: LocalMockOcrProvider) {}

  async recognizeInvoice(file: OcrInputFile) {
    return this.provider.recognizeInvoice(file)
  }
}
