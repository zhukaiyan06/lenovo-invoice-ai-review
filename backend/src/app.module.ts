import { Module } from '@nestjs/common'
import { AuthModule } from './auth/auth.module'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { ReportsModule } from './reports/reports.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, ReportsModule],
  controllers: [HealthController]
})
export class AppModule {}
