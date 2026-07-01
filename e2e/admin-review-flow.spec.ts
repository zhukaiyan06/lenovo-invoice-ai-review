import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const sampleInvoice = resolve(
  process.cwd(),
  'frontend/src/assets/demo-invoices/standard-lenovo-invoice.png'
)

test('后台连续完成通过、驳回、本人撤回和主管撤回', async ({ page }) => {
  const stamp = Date.now()
  const approveInvoiceNo = `ADMIN-APPROVE-${stamp}`
  const rejectInvoiceNo = `ADMIN-REJECT-${stamp}`
  const supervisorInvoiceNo = `ADMIN-SUPERVISOR-${stamp}`

  const approveReportId = await createSubmittedReport(page, approveInvoiceNo)
  await resetSession(page)
  await login(page, 'auditor-a')
  await openQueueReport(page, approveInvoiceNo)
  await page.getByRole('button', { name: '通过并归档' }).click()
  await page.getByRole('button', { name: '确认通过' }).click()
  await expect(page.getByText('该报备单已通过并归档')).toBeVisible()

  await page.getByRole('button', { name: '我的处理历史' }).click()
  await openHistoryReport(page, approveInvoiceNo)
  await page.getByRole('button', { name: '撤回决议' }).click()
  await page.getByRole('button', { name: '确认撤回' }).click()
  await expect(page.getByText('待 L2 确认', { exact: true })).toBeVisible()
  await expect(page.getByText('撤回审批决议')).toBeVisible()

  await resetSession(page)
  await createSubmittedReport(page, rejectInvoiceNo)
  await resetSession(page)
  await login(page, 'auditor-a')
  await openQueueReport(page, rejectInvoiceNo)
  await page.getByRole('button', { name: '驳回', exact: true }).click()
  await page.getByPlaceholder('请输入明确、可执行的驳回原因').fill('发票信息需要重新核对后提交。')
  await page.getByRole('button', { name: '确认驳回' }).click()
  await expect(page.getByText('该报备单已驳回')).toBeVisible()
  await expect(page.getByText('驳回审批')).toBeVisible()

  await page.getByRole('button', { name: '我的处理历史' }).click()
  await openHistoryReport(page, rejectInvoiceNo)
  await page.getByRole('button', { name: '撤回决议' }).click()
  await page.getByRole('button', { name: '确认撤回' }).click()
  await expect(page.getByText('待 L2 确认', { exact: true })).toBeVisible()

  await resetSession(page)
  const supervisorReportId = await createSubmittedReport(page, supervisorInvoiceNo)
  await resetSession(page)
  await login(page, 'auditor-b')
  await openQueueReport(page, supervisorInvoiceNo)
  await page.getByRole('button', { name: '通过并归档' }).click()
  await page.getByRole('button', { name: '确认通过' }).click()
  await expect(page.getByText('该报备单已通过并归档')).toBeVisible()

  await resetSession(page)
  await login(page, 'supervisor')
  await page.getByRole('button', { name: '全员审批历史' }).click()
  await expect(page).toHaveURL(/\/review\/history\/all$/)
  await openHistoryReport(page, supervisorInvoiceNo)
  await expect(page.getByText('auditor-b', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '撤回决议' }).click()
  await page.getByRole('button', { name: '确认撤回' }).click()
  await expect(page.getByText('待 L2 确认', { exact: true })).toBeVisible()

  expect(approveReportId).toBeTruthy()
  expect(supervisorReportId).toBeTruthy()
})

async function createSubmittedReport(page: Page, invoiceNo: string) {
  await login(page, 'l2-a')
  await page.getByRole('button', { name: '新建发票报备' }).click()
  await page.locator('input[type="file"]').setInputFiles(sampleInvoice)
  await page.getByRole('button', { name: '上传并创建报备单' }).click()
  await expect(page).toHaveURL(/\/reports\/[^/]+$/)

  const reportId = page.url().split('/').pop() ?? ''
  await page.getByRole('textbox', { name: '发票号' }).fill(invoiceNo)
  await page.getByRole('textbox', { name: '出货时间' }).fill('2026-06-23')

  const modelInputs = page.getByPlaceholder('请输入产品具体型号')
  await expect(modelInputs).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    await modelInputs.nth(index).fill(`${invoiceNo}-MODEL-${index + 1}`)
  }

  await page.getByRole('button', { name: '提交审核' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('待人工审批')
  return reportId
}

async function login(page: Page, username: string) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '账号' }).fill(username)
  await page.getByRole('textbox', { name: '密码' }).fill('demo123')
  await page.getByRole('button', { name: '登录工作台' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

async function resetSession(page: Page) {
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/login')
}

async function openQueueReport(page: Page, invoiceNo: string) {
  await expect(page).toHaveURL(/\/review$/)
  const row = page.getByRole('button').filter({ hasText: invoiceNo })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(page.getByRole('heading', { name: invoiceNo })).toBeVisible()
}

async function openHistoryReport(page: Page, invoiceNo: string) {
  const row = page.getByRole('button').filter({ hasText: invoiceNo })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(page.getByRole('heading', { name: invoiceNo })).toBeVisible()
}
