import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/current-user'
import type { AuthenticatedUser } from '../auth/auth.service'
import { UsersService } from '../users/users.service'
import { ReportsService } from './reports.service'

interface InvoiceUploadFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

interface SaveDraftBody {
  fields?: Record<string, string | null | undefined>
  items?: Array<{
    id: string
    productSpecificModel?: string | null
    purchaseQuantity?: string | null
    lineAmount?: string | null
    lineTaxAmount?: string | null
  }>
}

interface RejectBody {
  rejectionReason?: string
}

interface ArchivedReportQuery {
  l2?: string
  l1?: string
  model?: string
  itemName?: string
  province?: string
  prefectureCity?: string
  city?: string
  invoiceNo?: string
}

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(UsersService) private readonly users: UsersService
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'L2') {
      throw new ForbiddenException('第一阶段仅开放 L2 用户端')
    }

    return this.reports.listForOwner(user.id)
  }

  @Get('review/queue')
  async reviewQueue(@CurrentUser() user: AuthenticatedUser) {
    this.assertAuditor(user)
    return this.reports.listReviewQueue()
  }

  @Post('reset-demo')
  async resetDemo(@CurrentUser() user: AuthenticatedUser) {
    this.assertAuditor(user)
    await this.users.resetDemoReports()
    return { message: '演示数据已重置' }
  }

  @Get('review/history')
  async reviewHistory(@CurrentUser() user: AuthenticatedUser) {
    this.assertAuditor(user)
    return this.reports.listReviewHistory(user, false)
  }

  @Get('review/history/all')
  async allReviewHistory(@CurrentUser() user: AuthenticatedUser) {
    this.assertAuditor(user)
    return this.reports.listReviewHistory(user, true)
  }

  @Get('review/:id')
  async reviewDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.assertAuditor(user)
    return this.reports.getReviewDetail(id)
  }

  @Get('archived/summary')
  async archivedSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: ArchivedReportQuery) {
    this.assertAuditor(user)
    return this.reports.archivedSummary(query)
  }

  @Get('archived/model-summary')
  async archivedModelSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: ArchivedReportQuery) {
    this.assertAuditor(user)
    return this.reports.archivedModelSummary(query)
  }

  @Get('archived/l2-summary')
  async archivedL2Summary(@CurrentUser() user: AuthenticatedUser, @Query() query: ArchivedReportQuery) {
    this.assertAuditor(user)
    return this.reports.archivedL2Summary(query)
  }

  @Get('archived/l1-summary')
  async archivedL1Summary(@CurrentUser() user: AuthenticatedUser, @Query() query: ArchivedReportQuery) {
    this.assertAuditor(user)
    return this.reports.archivedL1Summary(query)
  }

  @Get('archived/flow-summary')
  async archivedFlowSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: ArchivedReportQuery) {
    this.assertAuditor(user)
    return this.reports.archivedFlowSummary(query)
  }

  @Get('archived/detail')
  async archivedDetail(@CurrentUser() user: AuthenticatedUser, @Query() query: ArchivedReportQuery) {
    this.assertAuditor(user)
    return this.reports.archivedDetail(query)
  }

  @Get('archived/export')
  async archivedExport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ArchivedReportQuery,
    @Res({ passthrough: true }) response: {
      setHeader: (name: string, value: string) => void
    }
  ) {
    this.assertAuditor(user)
    const exported = await this.reports.exportArchivedReports(query, user.id)
    response.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(exported.fileName)}"`
    )
    return new StreamableFile(exported.buffer)
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: InvoiceUploadFile
  ) {
    if (user.role !== 'L2') {
      throw new ForbiddenException('第一阶段仅开放 L2 用户端')
    }

    if (!file) {
      throw new BadRequestException('请上传发票文件')
    }

    return this.reports.createFromInvoiceUpload(user.id, file)
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (user.role !== 'L2') {
      throw new ForbiddenException('第一阶段仅开放 L2 用户端')
    }

    return this.reports.getOwnedDetail(id, user.id)
  }

  @Post(':id/approve')
  async approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.assertAuditor(user)
    return this.reports.reviewReport(id, user.id, 'approve')
  }

  @Post(':id/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: RejectBody
  ) {
    this.assertAuditor(user)
    return this.reports.reviewReport(id, user.id, 'reject', body.rejectionReason)
  }

  @Post(':id/review-withdraw')
  async withdrawReview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.assertAuditor(user)
    return this.reports.withdrawReview(id, user)
  }

  @Post(':id/submit')
  async submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (user.role !== 'L2') {
      throw new ForbiddenException('第一阶段仅开放 L2 用户端')
    }

    return this.reports.submitOwnedReport(id, user.id)
  }

  @Post(':id/draft')
  async saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SaveDraftBody
  ) {
    if (user.role !== 'L2') {
      throw new ForbiddenException('第一阶段仅开放 L2 用户端')
    }

    return this.reports.saveOwnedDraft(id, user.id, body)
  }

  @Get(':id/invoice')
  async invoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: { setHeader: (name: string, value: string) => void }
  ) {
    const invoice = await this.reports.getInvoiceFileForUser(id, user)
    response.setHeader('Content-Type', invoice.mimeType)
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(invoice.originalName)}"`
    )

    return new StreamableFile(invoice.stream)
  }


  private assertAuditor(user: AuthenticatedUser) {
    if (user.role !== 'AUDITOR' && user.role !== 'SUPERVISOR') {
      throw new ForbiddenException('当前账号无审核权限')
    }
  }
}
