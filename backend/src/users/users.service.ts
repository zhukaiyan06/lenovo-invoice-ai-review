import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { demoUsers } from './demo-users'

const demoReportIds = Array.from({ length: 8 }, (_, index) => `admin-demo-${index + 1}`)

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const user of demoUsers) {
      await this.prisma.user.upsert({
        where: { username: user.username },
        update: user,
        create: user
      })
    }

    await this.seedAdminDemoReports()
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username }
    })
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id }
    })
  }

  async resetDemoReports() {
    return this.seedAdminDemoReports()
  }

  private async seedAdminDemoReports() {
    const users = await this.prisma.user.findMany({
      where: { username: { in: ['l2-a', 'l2-b', 'auditor-a', 'auditor-b'] } }
    })
    const byUsername = Object.fromEntries(users.map((user) => [user.username, user]))
    const l2A = byUsername['l2-a']
    const l2B = byUsername['l2-b']
    const auditorA = byUsername['auditor-a']
    const auditorB = byUsername['auditor-b']
    if (!l2A || !l2B || !auditorA || !auditorB) return

    const invoicePath = resolve(process.cwd(), '../frontend/src/assets/demo-invoices/standard-lenovo-invoice.png')
    const invoiceSize = statSync(invoicePath).size
    const invoiceFile = await this.prisma.uploadedFile.upsert({
      where: { id: 'admin-demo-invoice' },
      update: { storagePath: invoicePath, size: invoiceSize },
      create: {
        id: 'admin-demo-invoice',
        originalName: '联想渠道演示发票.png',
        mimeType: 'image/png',
        storagePath: invoicePath,
        size: invoiceSize
      }
    })

    await this.prisma.report.deleteMany({ where: { id: { in: demoReportIds } } })

    const baseOcr = {
      status: 'SUCCESS',
      confidence: 0.98,
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
      itemLines: []
    }
    const now = Date.now()
    const scenarios = [
      { owner: l2A, status: '待人工审批-异常', label: '异常', codes: ['KEY_FIELD_MODIFIED'], total: '105400.00' },
      { owner: l2A, status: '待人工审批-异常', label: '异常', codes: ['DUPLICATE_INVOICE'], invoiceNo: '26372000001613754263' },
      { owner: l2B, status: '待人工审批-异常', label: '异常', codes: ['OCR_FAILED'], ocrStatus: 'FAILED' },
      { owner: l2B, status: '待人工审批-正常', label: '正常', codes: [], invoiceNo: '26372000001613754266' },
      { owner: l2A, status: '已锁定 / 审核归档', label: '异常', codes: ['KEY_FIELD_MODIFIED'], total: '105400.00', reviewer: auditorA },
      { owner: l2A, status: '已锁定 / 审核归档', label: '正常', codes: [], invoiceNo: '26372000001613754268', reviewer: auditorB },
      { owner: l2B, status: '已驳回', label: '异常', codes: ['DUPLICATE_INVOICE'], invoiceNo: '26372000001613754269', reviewer: auditorA, reason: '发票号码已存在，请核对后重新提交。' },
      { owner: l2B, status: '已驳回', label: '异常', codes: ['OCR_FAILED'], invoiceNo: '26372000001613754270', reviewer: auditorB, reason: 'OCR 识别失败，请核对发票原件和填报内容。' }
    ]

    for (const [index, scenario] of scenarios.entries()) {
      const submittedAt = new Date(now - (8 - index) * 60 * 60 * 1000)
      const reviewedAt = scenario.reviewer ? new Date(submittedAt.getTime() + 25 * 60 * 1000) : null
      const invoiceNo = scenario.invoiceNo ?? baseOcr.invoiceNo
      const total = scenario.total ?? baseOcr.totalTaxIncludedAmount
      const raw = { ...baseOcr, status: scenario.ocrStatus ?? 'SUCCESS' }

      await this.prisma.report.create({
        data: {
          id: demoReportIds[index],
          ownerUserId: scenario.owner.id,
          invoiceFileId: invoiceFile.id,
          status: scenario.status,
          aiLabel: scenario.label,
          anomalyCodes: JSON.stringify(scenario.codes),
          submittedAt,
          reviewedAt,
          reviewerUserId: scenario.reviewer?.id ?? null,
          rejectionReason: scenario.reason ?? null,
          fields: {
            create: {
              invoiceNo,
              invoiceDate: baseOcr.invoiceDate,
              shipmentDate: '2026-04-23',
              buyerName: baseOcr.buyerName,
              buyerCreditCode: baseOcr.buyerCreditCode,
              sellerName: baseOcr.sellerName,
              sellerCreditCode: baseOcr.sellerCreditCode,
              province: baseOcr.province,
              prefectureCity: baseOcr.prefectureCity,
              city: baseOcr.city,
              totalTaxIncludedAmount: total,
              totalAmount: baseOcr.totalAmount,
              totalTaxAmount: baseOcr.totalTaxAmount,
              remarks: `后台演示报备单 #${index + 1}`
            }
          },
          items: {
            create: [
              {
                invoiceItemName: '计算机配套产品',
                invoiceSpecModel: 'ThinkPad X1 Carbon',
                productSpecificModel: '21HM000QCD',
                unit: '台',
                purchaseQuantity: '20',
                lineAmount: '92389.38',
                lineTaxAmount: '12010.62',
                sortOrder: 0
              }
            ]
          },
          ocrResult: {
            create: {
              status: scenario.ocrStatus ?? 'SUCCESS',
              confidence: scenario.ocrStatus === 'FAILED' ? 0 : 0.98,
              rawJson: JSON.stringify(raw)
            }
          },
          logs: {
            create: [
              {
                operatorId: scenario.owner.id,
                operationType: 'OCR_PREFILL',
                fieldName: 'ocrResult',
                beforeValue: null,
                afterValue: scenario.ocrStatus ?? 'SUCCESS',
                createdAt: new Date(submittedAt.getTime() - 10 * 60 * 1000)
              },
              {
                operatorId: scenario.owner.id,
                operationType: 'SUBMIT_REPORT',
                fieldName: 'status',
                beforeValue: '待 L2 确认',
                afterValue: scenario.label === '异常' ? '待人工审批-异常' : '待人工审批-正常',
                createdAt: submittedAt
              },
              ...(scenario.reviewer
                ? [{
                    operatorId: scenario.reviewer.id,
                    operationType: scenario.status === '已驳回' ? 'REJECT_REPORT' : 'APPROVE_REPORT',
                    fieldName: 'status',
                    beforeValue: scenario.label === '异常' ? '待人工审批-异常' : '待人工审批-正常',
                    afterValue: scenario.status,
                    createdAt: reviewedAt as Date
                  }]
                : [])
            ]
          }
        }
      })
    }
  }
}
