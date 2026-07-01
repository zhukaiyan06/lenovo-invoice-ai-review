import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { OcrModule } from '../ocr/ocr.module'
import { UsersModule } from '../users/users.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [AuthModule, OcrModule, UsersModule],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}
