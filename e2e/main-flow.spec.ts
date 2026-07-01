import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const sampleInvoice = resolve(
  process.cwd(),
  'frontend/src/assets/demo-invoices/standard-lenovo-invoice.png'
)

test('L2 uploads and submits an invoice, auditor approves it, L2 sees the result', async ({ page }) => {
  const invoiceNo = `E2E-${Date.now()}`
  const firstModel = `${invoiceNo}-MODEL-1`

  await login(page, 'l2-a')
  await page.getByRole('button', { name: '新建发票报备' }).click()
  await expect(page).toHaveURL(/\/reports\/new$/)

  await page.locator('input[type="file"]').setInputFiles(sampleInvoice)
  await page.getByRole('button', { name: '上传并创建报备单' }).click()
  await expect(page).toHaveURL(/\/reports\/[^/]+$/)

  await page.getByRole('textbox', { name: '发票号' }).fill(invoiceNo)
  await page.getByRole('textbox', { name: '出货时间' }).fill('2026-06-23')

  const modelInputs = page.getByPlaceholder('请输入产品具体型号')
  await expect(modelInputs).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    await modelInputs.nth(index).fill(`${invoiceNo}-MODEL-${index + 1}`)
  }

  await page.getByRole('button', { name: '提交审核' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('待人工审批')
  const reportUrl = page.url()

  await resetSession(page)
  await login(page, 'auditor-a')
  await expect(page).toHaveURL(/\/review$/)

  const queueRow = page.getByRole('button').filter({ hasText: invoiceNo })
  await expect(queueRow).toHaveCount(1)
  await queueRow.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(invoiceNo)

  await page.getByRole('button', { name: '通过并归档' }).click()
  await page.getByRole('button', { name: '确认通过' }).click()
  await expect(page.getByText('该报备单已通过并归档')).toBeVisible()

  await page.getByRole('button', { name: '归档数据看板' }).click()
  await expect(page).toHaveURL(/\/review\/archived$/)
  await expect(page.getByRole('heading', { name: '归档数据看板' })).toBeVisible()
  await expect(page.getByText('一行对应一条商品明细行')).toBeVisible()
  const detailTable = page.locator('.detail-table')
  await expect(detailTable.getByText(firstModel)).toHaveCount(1)
  await expect(detailTable.getByText(invoiceNo, { exact: true })).toHaveCount(3)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 Excel' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/归档报备数据-.*\.xls/)

  await resetSession(page)
  await login(page, 'l2-a')
  await page.goto(reportUrl)
  await expect(page.getByRole('heading', { name: '后台审批结果' })).toBeVisible()
  await expect(page.getByText('已通过', { exact: true })).toBeVisible()
})

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
