import { Module } from '@nestjs/common'
import { LocalMockOcrProvider } from './local-mock-ocr.provider'
import { OcrService } from './ocr.service'

@Module({
  providers: [LocalMockOcrProvider, OcrService],
  exports: [OcrService]
})
export class OcrModule {}
