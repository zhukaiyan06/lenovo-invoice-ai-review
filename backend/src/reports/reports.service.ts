import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { OcrService } from '../ocr/ocr.service'
import type { OcrInvoiceResult } from '../ocr/ocr.types'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthenticatedUser } from '../auth/auth.service'
import { evaluateAiRules, type AiLabelResult } from './ai-label.rules'

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

export interface ArchivedReportQuery {
  l2?: string
  l1?: string
  model?: string
  itemName?: string
  province?: string
  prefectureCity?: string
  city?: string
  invoiceNo?: string
}

export interface ArchivedDetailRow {
  reportId: string
  invoiceNo: string | null
  invoiceDate: string | null
  shipmentDate: string | null
  l2Name: string | null
  l2CreditCode: string | null
  l1Name: string | null
  l1CreditCode: string | null
  province: string | null
  prefectureCity: string | null
  city: string | null
  totalAmount: string | null
  totalTaxAmount: string | null
  totalTaxIncludedAmount: string | null
  remarks: string | null
  submittedAt: Date | null
  itemId: string
  invoiceItemName: string | null
  invoiceSpecModel: string | null
  productSpecificModel: string | null
  unit: string | null
  purchaseQuantity: string | null
  lineAmount: string | null
  lineTaxAmount: string | null
  lineTaxIncludedAmount: string
}

interface SummaryRow {
  quantityTotal: number
  amountTotal: number
  reportIds: Set<string>
  invoiceNos: Set<string>
  l2Codes: Set<string>
  l1Codes: Set<string>
  models: Set<string>
}

const editableFieldNames = [
  'invoiceNo',
  'invoiceDate',
  'shipmentDate',
  'buyerName',
  'buyerCreditCode',
  'sellerName',
  'sellerCreditCode',
  'province',
  'prefectureCity',
  'city',
  'totalTaxIncludedAmount',
  'totalAmount',
  'totalTaxAmount',
  'remarks'
] as const

const fieldLabels: Record<string, string> = {
  invoiceNo: '发票号',
  invoiceDate: '开票日期',
  shipmentDate: '出货时间',
  buyerName: '购买方名称',
  buyerCreditCode: '购买方统一代码',
  sellerName: '销售方名称',
  sellerCreditCode: '销售方统一代码',
  province: '省份',
  prefectureCity: '地市',
  city: '城市',
  totalTaxIncludedAmount: '价税合计',
  totalAmount: '金额',
  totalTaxAmount: '税额'
}

const anomalyReasonLabels: Record<string, string> = {
  OCR_FAILED: 'OCR 识别失败，需要人工重点核验发票原件与填报内容',
  OCR_BUYER_CODE_NOT_RECOGNIZED_MANUAL_FILLED: 'OCR 未识别购买方统一代码，L2 后续人工补录',
  OCR_SELLER_CODE_NOT_RECOGNIZED_MANUAL_FILLED: 'OCR 未识别销售方统一代码，L2 后续人工补录',
  OCR_CODE_MANUAL_FILLED: '统一社会信用代码存在 OCR 空值后人工补录',
  DUPLICATE_INVOICE: '发票号与历史已提交报备单重复',
  KEY_FIELD_MODIFIED: 'L2 提交的价税合计与 OCR 原值不一致'
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OcrService) private readonly ocr: OcrService
  ) {}

  async archivedSummary(query: ArchivedReportQuery) {
    const rows = await this.loadArchivedRows(query)

    return {
      archivedReportTotal: new Set(rows.map((row) => row.reportId)).size,
      detailRowTotal: rows.length,
      quantityTotal: this.round(rows.reduce((total, row) => total + this.numberValue(row.purchaseQuantity), 0)),
      amountTotal: this.round(rows.reduce((total, row) => total + this.numberValue(row.lineAmount), 0)),
      l2Total: new Set(rows.map((row) => this.identityKey(row.l2Name, row.l2CreditCode))).size,
      l1Total: new Set(rows.map((row) => this.identityKey(row.l1Name, row.l1CreditCode))).size,
      modelTotal: new Set(rows.map((row) => row.productSpecificModel || '-')).size
    }
  }

  async archivedModelSummary(query: ArchivedReportQuery) {
    const rows = await this.loadArchivedRows(query)
    const grouped = this.groupRows(rows, (row) => `${row.productSpecificModel || '-'}\u0000${row.invoiceItemName || '-'}`)

    return {
      items: Array.from(grouped.entries()).map(([key, value]) => {
        const [productSpecificModel, invoiceItemName] = key.split('\u0000')
        return {
          productSpecificModel,
          invoiceItemName,
          ...this.summaryToPlain(value)
        }
      })
    }
  }

  async archivedL2Summary(query: ArchivedReportQuery) {
    const rows = await this.loadArchivedRows(query)
    const grouped = this.groupRows(rows, (row) => `${row.l2Name || '-'}\u0000${row.l2CreditCode || '-'}`)

    return {
      items: Array.from(grouped.entries()).map(([key, value]) => {
        const [l2Name, l2CreditCode] = key.split('\u0000')
        return {
          l2Name,
          l2CreditCode,
          ...this.summaryToPlain(value)
        }
      })
    }
  }

  async archivedL1Summary(query: ArchivedReportQuery) {
    const rows = await this.loadArchivedRows(query)
    const grouped = this.groupRows(rows, (row) => `${row.l1Name || '-'}\u0000${row.l1CreditCode || '-'}`)

    return {
      items: Array.from(grouped.entries()).map(([key, value]) => {
        const [l1Name, l1CreditCode] = key.split('\u0000')
        return {
          l1Name,
          l1CreditCode,
          ...this.summaryToPlain(value)
        }
      })
    }
  }

  async archivedFlowSummary(query: ArchivedReportQuery) {
    const rows = await this.loadArchivedRows(query)
    const grouped = this.groupRows(rows, (row) => [
      row.l2Name || '-',
      row.l2CreditCode || '-',
      row.l1Name || '-',
      row.l1CreditCode || '-',
      row.productSpecificModel || '-',
      row.invoiceItemName || '-'
    ].join('\u0000'))

    return {
      items: Array.from(grouped.entries()).map(([key, value]) => {
        const [l2Name, l2CreditCode, l1Name, l1CreditCode, productSpecificModel, invoiceItemName] = key.split('\u0000')
        return {
          l2Name,
          l2CreditCode,
          l1Name,
          l1CreditCode,
          productSpecificModel,
          invoiceItemName,
          ...this.summaryToPlain(value)
        }
      })
    }
  }

  async archivedDetail(query: ArchivedReportQuery) {
    const rows = await this.loadArchivedRows(query)
    return {
      items: rows,
      total: rows.length
    }
  }

  async exportArchivedReports(query: ArchivedReportQuery, operatorId: string) {
    const rows = await this.loadArchivedRows(query)
    const fileName = `archived-reports-${new Date().toISOString().slice(0, 10)}.xls`

    if (rows.length > 50000) {
      await this.prisma.exportLog.create({
        data: {
          operatorId,
          filtersJson: JSON.stringify(query),
          result: 'FAILED',
          rowCount: rows.length,
          fileName,
          errorMessage: '导出明细超过 50000 行'
        }
      })
      throw new BadRequestException('导出明细超过 50000 行，请缩小筛选范围')
    }

    const modelSummary = (await this.archivedModelSummary(query)).items
    const l2Summary = (await this.archivedL2Summary(query)).items
    const l1Summary = (await this.archivedL1Summary(query)).items
    const flowSummary = (await this.archivedFlowSummary(query)).items
    const workbook = this.toExcelXml([
      {
        name: '报备明细',
        headers: [
          '报备单号', '发票号', '开票日期', '出货时间', 'L2 经销商名称', 'L2 经销商统一社会信用代码',
          'L1 购买方名称', 'L1 购买方统一社会信用代码', '商品名称', '发票规格型号', '产品具体型号',
          '单位', '购买数量', '明细金额', '明细税额', '明细价税合计', '发票总金额', '发票总税额',
          '发票价税合计', '省', '地市', '城市', '备注', '报备提交时间'
        ],
        rows: rows.map((row) => [
          row.reportId, row.invoiceNo, row.invoiceDate, row.shipmentDate, row.l2Name, row.l2CreditCode,
          row.l1Name, row.l1CreditCode, row.invoiceItemName, row.invoiceSpecModel, row.productSpecificModel,
          row.unit, row.purchaseQuantity, row.lineAmount, row.lineTaxAmount, row.lineTaxIncludedAmount,
          row.totalAmount, row.totalTaxAmount, row.totalTaxIncludedAmount, row.province, row.prefectureCity,
          row.city, row.remarks, this.dateText(row.submittedAt)
        ])
      },
      {
        name: '型号汇总',
        headers: ['产品具体型号', '商品名称', '数量合计', '金额合计', '涉及 L2 经销商数量', '涉及 L1 购买方数量', '涉及报备单数量', '涉及发票数量'],
        rows: modelSummary.map((row) => [row.productSpecificModel, row.invoiceItemName, row.quantityTotal, row.amountTotal, row.l2Total, row.l1Total, row.reportTotal, row.invoiceTotal])
      },
      {
        name: 'L2 经销商汇总',
        headers: ['L2 经销商名称', 'L2 经销商统一社会信用代码', '数量合计', '金额合计', '涉及产品具体型号数量', '涉及 L1 购买方数量', '涉及报备单数量', '涉及发票数量'],
        rows: l2Summary.map((row) => [row.l2Name, row.l2CreditCode, row.quantityTotal, row.amountTotal, row.modelTotal, row.l1Total, row.reportTotal, row.invoiceTotal])
      },
      {
        name: 'L1 购买方汇总',
        headers: ['L1 购买方名称', 'L1 购买方统一社会信用代码', '数量合计', '金额合计', '涉及产品具体型号数量', '涉及 L2 经销商数量', '涉及报备单数量', '涉及发票数量'],
        rows: l1Summary.map((row) => [row.l1Name, row.l1CreditCode, row.quantityTotal, row.amountTotal, row.modelTotal, row.l2Total, row.reportTotal, row.invoiceTotal])
      },
      {
        name: 'L2+L1+型号汇总',
        headers: ['L2 经销商名称', 'L2 经销商统一社会信用代码', 'L1 购买方名称', 'L1 购买方统一社会信用代码', '产品具体型号', '商品名称', '数量合计', '金额合计', '涉及报备单数量', '涉及发票数量'],
        rows: flowSummary.map((row) => [row.l2Name, row.l2CreditCode, row.l1Name, row.l1CreditCode, row.productSpecificModel, row.invoiceItemName, row.quantityTotal, row.amountTotal, row.reportTotal, row.invoiceTotal])
      }
    ])

    await this.prisma.exportLog.create({
      data: {
        operatorId,
        filtersJson: JSON.stringify(query),
        result: 'SUCCESS',
        rowCount: rows.length,
        fileName
      }
    })

    return {
      fileName,
      buffer: Buffer.from(workbook, 'utf8')
    }
  }

  async listForOwner(ownerUserId: string) {
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where: { ownerUserId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          aiLabel: true,
          anomalyCodes: true,
          createdAt: true,
          updatedAt: true,
          submittedAt: true,
          invoiceFile: {
            select: {
              originalName: true,
              mimeType: true,
              size: true
            }
          },
          fields: {
            select: {
              invoiceNo: true,
              buyerName: true,
              totalTaxIncludedAmount: true
            }
          }
        }
      }),
      this.prisma.report.count({
        where: { ownerUserId }
      })
    ])

    return {
      items,
      total
    }
  }

  async listReviewQueue() {
    const queueItems = await this.prisma.report.findMany({
      where: {
        status: { in: ['待人工审批-正常', '待人工审批-异常'] }
      },
      orderBy: { submittedAt: 'asc' },
      select: {
        id: true,
        status: true,
        aiLabel: true,
        anomalyCodes: true,
        createdAt: true,
        updatedAt: true,
        submittedAt: true,
        reviewedAt: true,
        owner: {
          select: {
            username: true,
            orgName: true,
            region: true
          }
        },
        invoiceFile: {
          select: {
            originalName: true,
            mimeType: true,
            size: true
          }
        },
        fields: {
          select: {
            invoiceNo: true,
            buyerName: true,
            totalTaxIncludedAmount: true
          }
        },
        reviewer: {
          select: {
            username: true,
            orgName: true
          }
        }
      }
    })

    const items = queueItems.sort((left, right) => {
      if (left.aiLabel === right.aiLabel) return 0
      return left.aiLabel === '异常' ? -1 : 1
    })

    return {
      items: items.map((item) => this.toReviewListItem(item)),
      total: items.length,
      normalTotal: items.filter((item) => item.aiLabel === '正常').length,
      anomalyTotal: items.filter((item) => item.aiLabel === '异常').length
    }
  }

  async listReviewHistory(user: AuthenticatedUser, allReviewers: boolean) {
    if (allReviewers && user.role !== 'SUPERVISOR') {
      throw new ForbiddenException('仅主管可查看全员审批历史')
    }

    const historyItems = await this.prisma.report.findMany({
      where: {
        status: { in: ['已锁定 / 审核归档', '已驳回'] },
        reviewerUserId: allReviewers ? { not: null } : user.id
      },
      orderBy: { reviewedAt: 'desc' },
      select: {
        id: true,
        status: true,
        aiLabel: true,
        anomalyCodes: true,
        createdAt: true,
        updatedAt: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        owner: {
          select: {
            username: true,
            orgName: true,
            region: true
          }
        },
        reviewer: {
          select: {
            username: true,
            orgName: true
          }
        },
        invoiceFile: {
          select: {
            originalName: true,
            mimeType: true,
            size: true
          }
        },
        fields: {
          select: {
            invoiceNo: true,
            buyerName: true,
            totalTaxIncludedAmount: true
          }
        }
      }
    })

    return {
      items: historyItems.map((item) => this.toReviewListItem(item)),
      total: historyItems.length,
      normalTotal: historyItems.filter((item) => item.aiLabel === '正常').length,
      anomalyTotal: historyItems.filter((item) => item.aiLabel === '异常').length
    }
  }

  async createFromInvoiceUpload(ownerUserId: string, file: InvoiceUploadFile) {
    const uploadsDir = join(process.cwd(), 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const extension = extname(file.originalname) || this.extensionForMime(file.mimetype)
    const storageName = `${randomUUID()}${extension}`
    const storagePath = join(uploadsDir, storageName)

    await writeFile(storagePath, file.buffer)
    const ocrResult = await this.ocr.recognizeInvoice({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer
    })

    const report = await this.prisma.$transaction(async (tx) => {
      const uploadedFile = await tx.uploadedFile.create({
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          storagePath,
          size: file.size
        }
      })

      const createdReport = await tx.report.create({
        data: {
          ownerUserId,
          invoiceFileId: uploadedFile.id,
          status: '待 L2 确认',
          aiLabel: '未打标',
          fields: {
            create: this.ocrToFields(ocrResult)
          },
          items: {
            create: ocrResult.itemLines.map((line, index) => ({
              invoiceItemName: line.invoiceItemName,
              invoiceSpecModel: line.invoiceSpecModel,
              productSpecificModel: null,
              unit: line.unit,
              purchaseQuantity: line.purchaseQuantity,
              lineAmount: line.lineAmount,
              lineTaxAmount: line.lineTaxAmount,
              sortOrder: index
            }))
          },
          ocrResult: {
            create: {
              status: ocrResult.status,
              confidence: ocrResult.confidence,
              rawJson: JSON.stringify(ocrResult)
            }
          },
          logs: {
            create: [
              {
                operatorId: ownerUserId,
                operationType: 'UPLOAD_INVOICE',
                fieldName: 'invoiceFile',
                beforeValue: null,
                afterValue: uploadedFile.originalName
              },
              {
                operatorId: ownerUserId,
                operationType: 'OCR_PREFILL',
                fieldName: 'ocrResult',
                beforeValue: null,
                afterValue: `${ocrResult.status}:${ocrResult.confidence}`
              }
            ]
          }
        },
        include: {
          invoiceFile: true,
          fields: true,
          items: true,
          ocrResult: true,
          logs: {
            orderBy: { createdAt: 'desc' }
          }
        }
      })

      return createdReport
    })

    return this.toDetailResponse(report)
  }

  async getOwnedDetail(id: string, ownerUserId: string) {
    const report = await this.prisma.report.findFirst({
      where: {
        id,
        ownerUserId
      },
      include: {
        invoiceFile: true,
        fields: true,
        items: {
          orderBy: { sortOrder: 'asc' }
        },
        ocrResult: true,
        owner: true,
        reviewer: true,
        logs: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!report) {
      throw new NotFoundException('报备单不存在')
    }

    return this.toDetailResponse(report)
  }

  async getReviewDetail(id: string) {
    const report = await this.prisma.report.findFirst({
      where: { id, submittedAt: { not: null } },
      include: {
        invoiceFile: true,
        fields: true,
        items: { orderBy: { sortOrder: 'asc' } },
        ocrResult: true,
        owner: true,
        reviewer: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          include: { operator: { select: { username: true, role: true } } }
        }
      }
    })

    if (!report) {
      throw new NotFoundException('报备单不存在')
    }

    return this.toDetailResponse(report)
  }

  async getOwnedInvoiceFile(id: string, ownerUserId: string) {
    const report = await this.prisma.report.findFirst({
      where: {
        id,
        ownerUserId
      },
      include: {
        invoiceFile: true
      }
    })

    if (!report?.invoiceFile) {
      throw new NotFoundException('发票文件不存在')
    }

    return {
      originalName: report.invoiceFile.originalName,
      mimeType: report.invoiceFile.mimeType,
      stream: createReadStream(report.invoiceFile.storagePath)
    }
  }

  async getInvoiceFileForUser(id: string, user: AuthenticatedUser) {
    if (user.role === 'L2') {
      return this.getOwnedInvoiceFile(id, user.id)
    }

    if (user.role !== 'AUDITOR' && user.role !== 'SUPERVISOR') {
      throw new ForbiddenException('当前账号无权查看发票')
    }

    const report = await this.prisma.report.findFirst({
      where: { id, submittedAt: { not: null } },
      include: { invoiceFile: true }
    })

    if (!report?.invoiceFile) {
      throw new NotFoundException('发票文件不存在')
    }

    return {
      originalName: report.invoiceFile.originalName,
      mimeType: report.invoiceFile.mimeType,
      stream: createReadStream(report.invoiceFile.storagePath)
    }
  }

  async reviewReport(
    id: string,
    reviewerUserId: string,
    decision: 'approve' | 'reject',
    rejectionReason?: string
  ) {
    const report = await this.prisma.report.findUnique({ where: { id } })
    if (!report) {
      throw new NotFoundException('报备单不存在')
    }

    if (!['待人工审批-正常', '待人工审批-异常'].includes(report.status)) {
      throw new ForbiddenException('该报备单已处理或尚未提交，不能重复审批')
    }

    const normalizedReason = this.normalizeValue(rejectionReason)
    if (decision === 'reject' && !normalizedReason) {
      throw new BadRequestException('驳回时必须填写原因')
    }

    const nextStatus = decision === 'approve' ? '已锁定 / 审核归档' : '已驳回'
    const operationType = decision === 'approve' ? 'APPROVE_REPORT' : 'REJECT_REPORT'
    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewedAt: new Date(),
        reviewerUserId,
        rejectionReason: decision === 'reject' ? normalizedReason : null,
        logs: {
          create: {
            operatorId: reviewerUserId,
            operationType,
            fieldName: 'status',
            beforeValue: report.status,
            afterValue: decision === 'reject'
              ? `${nextStatus}:${normalizedReason}`
              : nextStatus
          }
        }
      },
      include: {
        invoiceFile: true,
        fields: true,
        items: { orderBy: { sortOrder: 'asc' } },
        ocrResult: true,
        owner: true,
        reviewer: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          include: { operator: { select: { username: true, role: true } } }
        }
      }
    })

    return this.toDetailResponse(updated)
  }

  async withdrawReview(id: string, user: AuthenticatedUser) {
    const report = await this.prisma.report.findUnique({ where: { id } })
    if (!report) {
      throw new NotFoundException('报备单不存在')
    }

    if (!['已锁定 / 审核归档', '已驳回'].includes(report.status)) {
      throw new BadRequestException('当前状态不能撤回审批决议')
    }

    if (user.role !== 'SUPERVISOR' && report.reviewerUserId !== user.id) {
      throw new ForbiddenException('审核员只能撤回自己的审批决议')
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: '待 L2 确认',
        logs: {
          create: {
            operatorId: user.id,
            operationType: 'WITHDRAW_REVIEW',
            fieldName: 'status',
            beforeValue: report.status,
            afterValue: '待 L2 确认'
          }
        }
      },
      include: {
        invoiceFile: true,
        fields: true,
        items: { orderBy: { sortOrder: 'asc' } },
        ocrResult: true,
        owner: true,
        reviewer: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          include: { operator: { select: { username: true, role: true } } }
        }
      }
    })

    return this.toDetailResponse(updated)
  }

  async saveOwnedDraft(id: string, ownerUserId: string, body: SaveDraftBody) {
    const report = await this.loadOwnedReport(id, ownerUserId)

    if (report.status !== '待 L2 确认') {
      throw new ForbiddenException('当前状态不可编辑')
    }

    await this.prisma.$transaction(async (tx) => {
      const fieldChanges: Array<{ fieldName: string; beforeValue: string | null; afterValue: string | null }> = []
      const fieldsUpdate: Record<string, string | null> = {}

      for (const fieldName of editableFieldNames) {
        if (!body.fields || !(fieldName in body.fields)) continue

        const beforeValue = this.normalizeValue((report.fields as Record<string, unknown> | null)?.[fieldName])
        const afterValue = this.normalizeValue(body.fields[fieldName])

        fieldsUpdate[fieldName] = afterValue

        if (beforeValue !== afterValue) {
          fieldChanges.push({ fieldName, beforeValue, afterValue })
        }
      }

      if (Object.keys(fieldsUpdate).length > 0) {
        await tx.reportFields.update({
          where: { reportId: report.id },
          data: fieldsUpdate
        })
      }

      for (const item of body.items ?? []) {
        const existing = report.items.find((entry) => entry.id === item.id)
        if (!existing) continue

        const itemUpdate = {
          productSpecificModel: this.normalizeValue(item.productSpecificModel),
          purchaseQuantity: this.normalizeValue(item.purchaseQuantity),
          lineAmount: this.normalizeValue(item.lineAmount),
          lineTaxAmount: this.normalizeValue(item.lineTaxAmount)
        }

        await tx.reportItem.update({
          where: { id: item.id },
          data: itemUpdate
        })

        for (const [fieldName, afterValue] of Object.entries(itemUpdate)) {
          const beforeValue = this.normalizeValue((existing as Record<string, unknown>)[fieldName])
          if (beforeValue !== afterValue) {
            fieldChanges.push({
              fieldName: `item.${existing.sortOrder + 1}.${fieldName}`,
              beforeValue,
              afterValue
            })
          }
        }
      }

      if (fieldChanges.length > 0) {
        await tx.reportLog.createMany({
          data: fieldChanges.map((change) => ({
            reportId: report.id,
            operatorId: ownerUserId,
            operationType: 'FIELD_UPDATE',
            fieldName: change.fieldName,
            beforeValue: change.beforeValue,
            afterValue: change.afterValue
          }))
        })
      }
    })

    return this.getOwnedDetail(id, ownerUserId)
  }

  async submitOwnedReport(id: string, ownerUserId: string) {
    const report = await this.loadOwnedReport(id, ownerUserId)

    if (report.status !== '待 L2 确认') {
      throw new ForbiddenException('当前状态不可提交')
    }

    const missingFields = this.validateRequiredFields(report)

    if (missingFields.length > 0) {
      throw new BadRequestException({
        message: '必填字段缺失',
        missingFields
      })
    }

    const aiResult = await this.evaluateAiLabel(report)
    const nextStatus = aiResult.aiLabel === '异常' ? '待人工审批-异常' : '待人工审批-正常'

    const updated = await this.prisma.report.update({
      where: { id: report.id },
      data: {
        status: nextStatus,
        aiLabel: aiResult.aiLabel,
        anomalyCodes: JSON.stringify(aiResult.anomalyCodes),
        submittedAt: new Date(),
        logs: {
          create: [
            {
              operatorId: ownerUserId,
              operationType: 'SUBMIT_REPORT',
              fieldName: 'status',
              beforeValue: report.status,
              afterValue: nextStatus
            },
            {
              operatorId: ownerUserId,
              operationType: 'AI_LABEL',
              fieldName: 'aiLabel',
              beforeValue: report.aiLabel,
              afterValue: `${aiResult.aiLabel}:${aiResult.anomalyCodes.join(',') || 'NONE'}`
            }
          ]
        }
      },
      include: {
        invoiceFile: true,
        fields: true,
        items: {
          orderBy: { sortOrder: 'asc' }
        },
        ocrResult: true,
        logs: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    return this.toDetailResponse(updated)
  }

  private toDetailResponse(report: {
    id: string
    status: string
    aiLabel: string
    anomalyCodes: string
    createdAt: Date
    updatedAt: Date
    submittedAt: Date | null
    reviewedAt?: Date | null
    rejectionReason?: string | null
    invoiceFile: {
      id: string
      originalName: string
      mimeType: string
      size: number
      createdAt: Date
    } | null
    fields: unknown
    items: unknown[]
    ocrResult?: unknown
    logs?: unknown[]
    owner?: { username: string; orgName: string; region: string | null }
    reviewer?: { username: string; orgName: string } | null
  }) {
    return {
      report: {
        id: report.id,
        status: report.status,
        aiLabel: report.aiLabel,
        anomalyCodes: JSON.parse(report.anomalyCodes),
        anomalyReasons: this.codesToReasons(JSON.parse(report.anomalyCodes)),
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        submittedAt: report.submittedAt,
        reviewedAt: report.reviewedAt ?? null,
        rejectionReason: report.rejectionReason ?? null,
        owner: report.owner ?? null,
        reviewer: report.reviewer ?? null,
        invoiceFile: report.invoiceFile
          ? {
              id: report.invoiceFile.id,
              originalName: report.invoiceFile.originalName,
              mimeType: report.invoiceFile.mimeType,
              size: report.invoiceFile.size,
              createdAt: report.invoiceFile.createdAt
            }
          : null,
        invoiceUrl: `/api/reports/${report.id}/invoice`,
        fields: report.fields,
        items: report.items,
        ocrResult: this.parseOcrResult(report.ocrResult),
        logs: report.logs ?? []
      }
    }
  }

  private toReviewListItem<T extends { anomalyCodes: string }>(item: T) {
    const anomalyCodes = JSON.parse(item.anomalyCodes) as string[]
    return {
      ...item,
      anomalyCodes,
      anomalyReasons: this.codesToReasons(anomalyCodes)
    }
  }

  private async loadArchivedRows(query: ArchivedReportQuery): Promise<ArchivedDetailRow[]> {
    const contains = (value?: string) => {
      const normalized = this.normalizeValue(value)
      return normalized ? { contains: normalized } : undefined
    }

    const reports = await this.prisma.report.findMany({
      where: {
        status: '已锁定 / 审核归档',
        fields: {
          is: {
            invoiceNo: contains(query.invoiceNo),
            sellerName: contains(query.l2),
            buyerName: contains(query.l1),
            province: contains(query.province),
            prefectureCity: contains(query.prefectureCity),
            city: contains(query.city)
          }
        }
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        fields: true,
        items: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    })

    const modelFilter = this.normalizeValue(query.model)?.toLowerCase()
    const itemNameFilter = this.normalizeValue(query.itemName)?.toLowerCase()
    const rows: ArchivedDetailRow[] = []

    for (const report of reports) {
      for (const item of report.items) {
        if (modelFilter && !String(item.productSpecificModel ?? '').toLowerCase().includes(modelFilter)) continue
        if (itemNameFilter && !String(item.invoiceItemName ?? '').toLowerCase().includes(itemNameFilter)) continue

        rows.push({
          reportId: report.id,
          invoiceNo: report.fields?.invoiceNo ?? null,
          invoiceDate: report.fields?.invoiceDate ?? null,
          shipmentDate: report.fields?.shipmentDate ?? null,
          l2Name: report.fields?.sellerName ?? null,
          l2CreditCode: report.fields?.sellerCreditCode ?? null,
          l1Name: report.fields?.buyerName ?? null,
          l1CreditCode: report.fields?.buyerCreditCode ?? null,
          province: report.fields?.province ?? null,
          prefectureCity: report.fields?.prefectureCity ?? null,
          city: report.fields?.city ?? null,
          totalAmount: report.fields?.totalAmount ?? null,
          totalTaxAmount: report.fields?.totalTaxAmount ?? null,
          totalTaxIncludedAmount: report.fields?.totalTaxIncludedAmount ?? null,
          remarks: report.fields?.remarks ?? null,
          submittedAt: report.submittedAt,
          itemId: item.id,
          invoiceItemName: item.invoiceItemName,
          invoiceSpecModel: item.invoiceSpecModel,
          productSpecificModel: item.productSpecificModel,
          unit: item.unit,
          purchaseQuantity: item.purchaseQuantity,
          lineAmount: item.lineAmount,
          lineTaxAmount: item.lineTaxAmount,
          lineTaxIncludedAmount: this.moneyText(
            this.numberValue(item.lineAmount) + this.numberValue(item.lineTaxAmount)
          )
        })
      }
    }

    return rows
  }

  private groupRows(rows: ArchivedDetailRow[], keyFor: (row: ArchivedDetailRow) => string) {
    const grouped = new Map<string, SummaryRow>()

    for (const row of rows) {
      const key = keyFor(row)
      const current = grouped.get(key) ?? {
        quantityTotal: 0,
        amountTotal: 0,
        reportIds: new Set<string>(),
        invoiceNos: new Set<string>(),
        l2Codes: new Set<string>(),
        l1Codes: new Set<string>(),
        models: new Set<string>()
      }

      current.quantityTotal += this.numberValue(row.purchaseQuantity)
      current.amountTotal += this.numberValue(row.lineAmount)
      current.reportIds.add(row.reportId)
      current.invoiceNos.add(row.invoiceNo || row.reportId)
      current.l2Codes.add(this.identityKey(row.l2Name, row.l2CreditCode))
      current.l1Codes.add(this.identityKey(row.l1Name, row.l1CreditCode))
      current.models.add(row.productSpecificModel || '-')
      grouped.set(key, current)
    }

    return grouped
  }

  private summaryToPlain(summary: SummaryRow) {
    return {
      quantityTotal: this.round(summary.quantityTotal),
      amountTotal: this.round(summary.amountTotal),
      reportTotal: summary.reportIds.size,
      invoiceTotal: summary.invoiceNos.size,
      l2Total: summary.l2Codes.size,
      l1Total: summary.l1Codes.size,
      modelTotal: summary.models.size
    }
  }

  private toExcelXml(sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number | null | undefined>> }>) {
    const worksheets = sheets.map((sheet) => `
      <Worksheet ss:Name="${this.xml(sheet.name)}">
        <Table>
          <Row>${sheet.headers.map((header) => this.excelCell(header)).join('')}</Row>
          ${sheet.rows.map((row) => `<Row>${row.map((cell) => this.excelCell(cell)).join('')}</Row>`).join('')}
        </Table>
      </Worksheet>
    `).join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${worksheets}
</Workbook>`
  }

  private excelCell(value: string | number | null | undefined) {
    const type = typeof value === 'number' ? 'Number' : 'String'
    return `<Cell><Data ss:Type="${type}">${this.xml(value ?? '')}</Data></Cell>`
  }

  private xml(value: string | number) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
  }

  private numberValue(value: unknown) {
    if (value === undefined || value === null) return 0
    const parsed = Number(String(value).replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }

  private round(value: number) {
    return Math.round(value * 100) / 100
  }

  private moneyText(value: number) {
    return this.round(value).toFixed(2)
  }

  private identityKey(name: string | null, code: string | null) {
    return `${name || '-'}:${code || '-'}`
  }

  private dateText(value: Date | null) {
    return value ? value.toISOString() : ''
  }

  private ocrToFields(ocrResult: OcrInvoiceResult) {
    return {
      invoiceNo: ocrResult.invoiceNo,
      invoiceDate: ocrResult.invoiceDate,
      shipmentDate: null,
      buyerName: ocrResult.buyerName,
      buyerCreditCode: ocrResult.buyerCreditCode,
      sellerName: ocrResult.sellerName,
      sellerCreditCode: ocrResult.sellerCreditCode,
      province: ocrResult.province,
      prefectureCity: ocrResult.prefectureCity,
      city: ocrResult.city,
      totalTaxIncludedAmount: ocrResult.totalTaxIncludedAmount,
      totalAmount: ocrResult.totalAmount,
      totalTaxAmount: ocrResult.totalTaxAmount,
      remarks: null
    }
  }

  private parseOcrResult(ocrResult: unknown) {
    if (!ocrResult || typeof ocrResult !== 'object' || !('rawJson' in ocrResult)) {
      return null
    }

    const rawJson = String((ocrResult as { rawJson: string }).rawJson)

    return {
      ...(ocrResult as object),
      raw: JSON.parse(rawJson)
    }
  }

  private extensionForMime(mimeType: string) {
    if (mimeType === 'application/pdf') return '.pdf'
    if (mimeType === 'image/png') return '.png'
    if (mimeType === 'image/webp') return '.webp'
    if (mimeType === 'image/jpeg') return '.jpg'
    return ''
  }

  private async loadOwnedReport(id: string, ownerUserId: string) {
    const report = await this.prisma.report.findFirst({
      where: {
        id,
        ownerUserId
      },
      include: {
        invoiceFile: true,
        fields: true,
        items: {
          orderBy: { sortOrder: 'asc' }
        },
        ocrResult: true,
        owner: true,
        reviewer: true,
        logs: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!report) {
      throw new NotFoundException('报备单不存在')
    }

    return report
  }

  private validateRequiredFields(report: Awaited<ReturnType<ReportsService['loadOwnedReport']>>) {
    const missingFields: string[] = []
    const fields = report.fields as Record<string, unknown> | null

    for (const fieldName of [
      'invoiceNo',
      'invoiceDate',
      'buyerName',
      'buyerCreditCode',
      'sellerName',
      'sellerCreditCode',
      'province',
      'prefectureCity',
      'city',
      'totalTaxIncludedAmount',
      'shipmentDate'
    ]) {
      if (!this.normalizeValue(fields?.[fieldName])) {
        missingFields.push(fieldLabels[fieldName])
      }
    }

    if (report.items.length === 0) {
      missingFields.push('产品明细为空')
    }

    for (const item of report.items) {
      const row = item.sortOrder + 1
      if (!this.normalizeValue(item.productSpecificModel)) {
        missingFields.push(`第 ${row} 行产品具体型号`)
      }
      if (!this.normalizeValue(item.purchaseQuantity)) {
        missingFields.push(`第 ${row} 行购买数量`)
      }
      if (!this.normalizeValue(item.lineAmount)) {
        missingFields.push(`第 ${row} 行行金额`)
      }
      if (!this.normalizeValue(item.lineTaxAmount)) {
        missingFields.push(`第 ${row} 行行税额`)
      }
    }

    return missingFields
  }

  private async evaluateAiLabel(report: Awaited<ReturnType<ReportsService['loadOwnedReport']>>): Promise<AiLabelResult> {
    const fields = report.fields as Record<string, unknown> | null
    const raw = this.parseOcrResult(report.ocrResult)?.raw as OcrInvoiceResult | undefined

    const invoiceNo = this.normalizeValue(fields?.invoiceNo)
    let duplicateInvoice = false
    if (invoiceNo) {
      const duplicated = await this.prisma.report.findFirst({
        where: {
          id: { not: report.id },
          submittedAt: { not: null },
          fields: {
            is: {
              invoiceNo
            }
          }
        },
        select: { id: true }
      })

      duplicateInvoice = Boolean(duplicated)
    }

    return evaluateAiRules({
      ocrStatus: report.ocrResult?.status ?? null,
      ocrFields: raw ?? null,
      submittedFields: fields,
      duplicateInvoice
    })
  }

  private codesToReasons(codes: string[]) {
    return codes.map((code) => ({
      code,
      message: anomalyReasonLabels[code] ?? code
    }))
  }

  private normalizeValue(value: unknown) {
    if (value === undefined || value === null) return null
    const text = String(value).trim()
    return text.length > 0 ? text : null
  }
}
