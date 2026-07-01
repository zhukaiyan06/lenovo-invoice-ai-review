import 'reflect-metadata'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

describe.sequential('reports API', () => {
  let app: INestApplication
  let prisma: PrismaService
  let baseUrl: string
  let databaseDir: string
  let l2Token: string
  let auditorToken: string
  let supervisorToken: string
  let approveReportId: string
  let rejectReportId: string
  let archivedReportId: string

  beforeAll(async () => {
    databaseDir = mkdtempSync(join(tmpdir(), 'invoice-api-test-'))
    const databasePath = join(databaseDir, 'test.db')
    copyFileSync(join(process.cwd(), 'prisma', 'dev.db'), databasePath)
    process.env.DATABASE_URL = `file:${databasePath}`

    app = await NestFactory.create(AppModule, { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    prisma = app.get(PrismaService)

    const owner = await prisma.user.findUniqueOrThrow({ where: { username: 'l2-a' } })
    const [approveReport, rejectReport] = await Promise.all([
      createPendingReport(owner.id, 'API-APPROVE'),
      createPendingReport(owner.id, 'API-REJECT')
    ])
    approveReportId = approveReport.id
    rejectReportId = rejectReport.id
    archivedReportId = (await createArchivedReport(owner.id)).id

    l2Token = await login('l2-a')
    auditorToken = await login('auditor-a')
    supervisorToken = await login('supervisor')
  })

  afterAll(async () => {
    await app?.close()
    rmSync(databaseDir, { recursive: true, force: true })
  })

  it('enforces role access for the review queue', async () => {
    const l2Queue = await request('/api/reports/review/queue', { token: l2Token })
    const auditorQueue = await request('/api/reports/review/queue', { token: auditorToken })

    expect(l2Queue.response.status).toBe(403)
    expect(auditorQueue.response.status).toBe(200)
    expect(auditorQueue.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: approveReportId }),
      expect.objectContaining({ id: rejectReportId })
    ]))
  })

  it('requires a reason when rejecting a report', async () => {
    const result = await request(`/api/reports/${rejectReportId}/reject`, {
      method: 'POST',
      token: auditorToken,
      body: { rejectionReason: ' ' }
    })

    expect(result.response.status).toBe(400)
    expect(result.body.message).toBe('驳回时必须填写原因')
  })

  it('approves a pending report and blocks a repeated decision', async () => {
    const approved = await request(`/api/reports/${approveReportId}/approve`, {
      method: 'POST',
      token: auditorToken
    })
    const repeated = await request(`/api/reports/${approveReportId}/approve`, {
      method: 'POST',
      token: auditorToken
    })

    expect(approved.response.status).toBe(201)
    expect(approved.body.report.status).toBe('已锁定 / 审核归档')
    expect(approved.body.report.reviewer.username).toBe('auditor-a')
    expect(repeated.response.status).toBe(403)
  })

  it('persists a rejection reason for the L2 detail view', async () => {
    const reason = '发票金额与报备信息不一致，请核对后重新提交。'
    const rejected = await request(`/api/reports/${rejectReportId}/reject`, {
      method: 'POST',
      token: auditorToken,
      body: { rejectionReason: reason }
    })
    const l2Detail = await request(`/api/reports/${rejectReportId}`, { token: l2Token })

    expect(rejected.response.status).toBe(201)
    expect(l2Detail.body.report.status).toBe('已驳回')
    expect(l2Detail.body.report.rejectionReason).toBe(reason)
    expect(l2Detail.body.report.reviewer.username).toBe('auditor-a')
  })

  it('limits personal history and protects all-reviewer history', async () => {
    const personal = await request('/api/reports/review/history', { token: auditorToken })
    const forbiddenAll = await request('/api/reports/review/history/all', { token: auditorToken })
    const supervisorAll = await request('/api/reports/review/history/all', { token: supervisorToken })

    expect(personal.response.status).toBe(200)
    expect(personal.body.items.length).toBeGreaterThanOrEqual(2)
    expect(personal.body.items.every((item: { reviewer: { username: string } }) => item.reviewer.username === 'auditor-a')).toBe(true)
    expect(forbiddenAll.response.status).toBe(403)
    expect(supervisorAll.response.status).toBe(200)
    expect(supervisorAll.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ reviewer: expect.objectContaining({ username: 'auditor-a' }) }),
      expect.objectContaining({ reviewer: expect.objectContaining({ username: 'auditor-b' }) })
    ]))
  })

  it('lets an auditor withdraw only their own decision and appends an audit log', async () => {
    const own = await request('/api/reports/admin-demo-5/review-withdraw', {
      method: 'POST',
      token: auditorToken
    })
    const other = await request('/api/reports/admin-demo-6/review-withdraw', {
      method: 'POST',
      token: auditorToken
    })

    expect(own.response.status).toBe(201)
    expect(own.body.report.status).toBe('待 L2 确认')
    expect(own.body.report.logs[0]).toEqual(expect.objectContaining({
      operationType: 'WITHDRAW_REVIEW',
      beforeValue: '已锁定 / 审核归档',
      afterValue: '待 L2 确认',
      operator: expect.objectContaining({ username: 'auditor-a' })
    }))
    expect(other.response.status).toBe(403)
    expect(other.body.message).toBe('审核员只能撤回自己的审批决议')
  })

  it('lets a supervisor withdraw any auditor decision including a rejection', async () => {
    const approved = await request('/api/reports/admin-demo-6/review-withdraw', {
      method: 'POST',
      token: supervisorToken
    })
    const rejected = await request('/api/reports/admin-demo-8/review-withdraw', {
      method: 'POST',
      token: supervisorToken
    })
    const repeated = await request('/api/reports/admin-demo-8/review-withdraw', {
      method: 'POST',
      token: supervisorToken
    })

    expect(approved.response.status).toBe(201)
    expect(rejected.response.status).toBe(201)
    expect(approved.body.report.status).toBe('待 L2 确认')
    expect(rejected.body.report.status).toBe('待 L2 确认')
    expect(rejected.body.report.logs[0].operator.username).toBe('supervisor')
    expect(repeated.response.status).toBe(400)
  })

  it('serves archived dashboard data only to backend users and records exports', async () => {
    const forbidden = await request('/api/reports/archived/summary', { token: l2Token })
    const summary = await request('/api/reports/archived/summary?model=ThinkPad', { token: auditorToken })
    const detail = await request('/api/reports/archived/detail?model=ThinkPad', { token: auditorToken })
    const exported = await fetch(`${baseUrl}/api/reports/archived/export?model=ThinkPad`, {
      headers: { authorization: `Bearer ${auditorToken}` }
    })
    const content = await exported.text()
    const latestLog = await prisma.exportLog.findFirst({
      where: { operator: { username: 'auditor-a' } },
      orderBy: { createdAt: 'desc' }
    })

    expect(forbidden.response.status).toBe(403)
    expect(summary.response.status).toBe(200)
    expect(summary.body.archivedReportTotal).toBeGreaterThanOrEqual(1)
    expect(summary.body.quantityTotal).toBeGreaterThanOrEqual(3)
    expect(detail.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reportId: archivedReportId,
        productSpecificModel: 'ThinkPad X1 Carbon'
      })
    ]))
    expect(exported.status).toBe(200)
    expect(content).toContain('<Worksheet ss:Name="报备明细">')
    expect(content).toContain('ThinkPad X1 Carbon')
    expect(latestLog).toEqual(expect.objectContaining({
      result: 'SUCCESS',
      rowCount: expect.any(Number),
      fileName: expect.stringContaining('.xls')
    }))
  })

  async function createPendingReport(ownerUserId: string, invoiceNo: string) {
    return prisma.report.create({
      data: {
        ownerUserId,
        status: '待人工审批-正常',
        aiLabel: '正常',
        anomalyCodes: '[]',
        submittedAt: new Date(),
        fields: {
          create: {
            invoiceNo,
            invoiceDate: '2026-06-22',
            shipmentDate: '2026-06-23',
            buyerName: 'API 测试购买方',
            buyerCreditCode: 'BUYER-TEST-CODE',
            sellerName: 'API 测试销售方',
            sellerCreditCode: 'SELLER-TEST-CODE',
            province: '山东省',
            prefectureCity: '济南市',
            city: '历下区',
            totalTaxIncludedAmount: '100.00'
          }
        }
      }
    })
  }

  async function createArchivedReport(ownerUserId: string) {
    const reviewer = await prisma.user.findUniqueOrThrow({ where: { username: 'auditor-a' } })
    return prisma.report.create({
      data: {
        ownerUserId,
        reviewerUserId: reviewer.id,
        status: '已锁定 / 审核归档',
        aiLabel: '正常',
        anomalyCodes: '[]',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        fields: {
          create: {
            invoiceNo: 'ARCHIVED-EXPORT-001',
            invoiceDate: '2026-06-22',
            shipmentDate: '2026-06-23',
            buyerName: '归档测试 L1 购买方',
            buyerCreditCode: 'L1-ARCHIVED-CODE',
            sellerName: '归档测试 L2 经销商',
            sellerCreditCode: 'L2-ARCHIVED-CODE',
            province: '山东省',
            prefectureCity: '济南市',
            city: '历下区',
            totalTaxIncludedAmount: '18888.00',
            totalAmount: '16715.04',
            totalTaxAmount: '2172.96'
          }
        },
        items: {
          create: [
            {
              invoiceItemName: '笔记本电脑',
              invoiceSpecModel: 'X1',
              productSpecificModel: 'ThinkPad X1 Carbon',
              unit: '台',
              purchaseQuantity: '3',
              lineAmount: '15000.00',
              lineTaxAmount: '1950.00',
              sortOrder: 0
            },
            {
              invoiceItemName: '台式电脑',
              invoiceSpecModel: 'M90',
              productSpecificModel: 'ThinkCentre M90q',
              unit: '台',
              purchaseQuantity: '2',
              lineAmount: '1715.04',
              lineTaxAmount: '222.96',
              sortOrder: 1
            }
          ]
        }
      }
    })
  }

  async function login(username: string) {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: { username, password: 'demo123' }
    })
    expect(result.response.status).toBe(201)
    return String(result.body.token)
  }

  async function request(
    path: string,
    options: { method?: string; token?: string; body?: Record<string, unknown> } = {}
  ) {
    const headers: Record<string, string> = {}
    if (options.token) headers.authorization = `Bearer ${options.token}`
    if (options.body) headers['content-type'] = 'application/json'

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    })
    const body = await response.json()
    return { response, body }
  }
})
