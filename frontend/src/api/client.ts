export interface ApiUser {
  id: string
  username: string
  role: string
  orgName: string
  region: string | null
}

export interface ReportListItem {
  id: string
  status: string
  aiLabel: string
  anomalyCodes: string | string[]
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  invoiceFile: {
    originalName: string
    mimeType: string
    size: number
  } | null
  fields: {
    invoiceNo: string | null
    buyerName: string | null
    totalTaxIncludedAmount: string | null
  } | null
}

export interface ReportListResponse {
  items: ReportListItem[]
  total: number
}

export interface ReviewQueueItem extends Omit<ReportListItem, 'anomalyCodes'> {
  anomalyCodes: string[]
  anomalyReasons: Array<{
    code: string
    message: string
  }>
  reviewedAt: string | null
  rejectionReason?: string | null
  owner: {
    username: string
    orgName: string
    region: string | null
  }
  reviewer: {
    username: string
    orgName: string
  } | null
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[]
  total: number
  normalTotal: number
  anomalyTotal: number
}

export interface ArchivedReportFilters {
  l2?: string
  l1?: string
  model?: string
  itemName?: string
  province?: string
  prefectureCity?: string
  city?: string
  invoiceNo?: string
}

export interface ArchivedSummary {
  archivedReportTotal: number
  detailRowTotal: number
  quantityTotal: number
  amountTotal: number
  l2Total: number
  l1Total: number
  modelTotal: number
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
  submittedAt: string | null
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

export interface ArchivedSummaryRow {
  quantityTotal: number
  amountTotal: number
  reportTotal: number
  invoiceTotal: number
  l2Total: number
  l1Total: number
  modelTotal: number
  productSpecificModel?: string
  invoiceItemName?: string
  l2Name?: string
  l2CreditCode?: string
  l1Name?: string
  l1CreditCode?: string
}

export interface ReportDetail {
  id: string
  status: string
  aiLabel: string
  anomalyCodes: string[]
  anomalyReasons: Array<{
    code: string
    message: string
  }>
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  owner: {
    username: string
    orgName: string
    region: string | null
  } | null
  reviewer: {
    username: string
    orgName: string
  } | null
  invoiceUrl: string
  invoiceFile: {
    id: string
    originalName: string
    mimeType: string
    size: number
    createdAt: string
  } | null
  fields: Record<string, string | number | null> | null
  items: Array<{
    id: string
    invoiceItemName: string | null
    invoiceSpecModel: string | null
    productSpecificModel: string | null
    unit: string | null
    purchaseQuantity: string | null
    lineAmount: string | null
    lineTaxAmount: string | null
    sortOrder: number
  }>
  ocrResult: {
    id: string
    status: string
    confidence: number
    raw: {
      invoiceNo: string
      invoiceDate: string
      buyerName: string
      buyerCreditCode: string
      sellerName: string
      sellerCreditCode: string
      province: string
      prefectureCity: string
      city: string
      totalTaxIncludedAmount: string
      totalAmount: string
      totalTaxAmount: string
    }
  } | null
  logs: Array<{
    id: string
    operationType: string
    fieldName: string | null
    beforeValue: string | null
    afterValue: string | null
    createdAt: string
    operator?: {
      username: string
      role: string
    }
  }>
}

interface ReportDetailResponse {
  report: ReportDetail
}

export interface SaveDraftPayload {
  fields: Record<string, string | null>
  items: Array<{
    id: string
    productSpecificModel: string | null
    purchaseQuantity: string | null
    lineAmount: string | null
    lineTaxAmount: string | null
  }>
}

interface LoginResponse {
  token: string
  user: ApiUser
}

interface MeResponse {
  user: ApiUser
}

const tokenKey = 'lenovo.invoice.authToken'

const apiBaseUrl: string =
  (typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as Record<string, string>)['VITE_API_BASE_URL']
    : undefined)
  || ''

export function getStoredToken() {
  return window.localStorage.getItem(tokenKey)
}

export function storeToken(token: string) {
  window.localStorage.setItem(tokenKey, token)
}

export function clearStoredToken() {
  window.localStorage.removeItem(tokenKey)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const headers = new Headers(options.headers)

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string
      missingFields?: string[]
    } | null
    const missing = payload?.missingFields?.filter(Boolean)
    const message = missing?.length
      ? `${payload?.message ?? '请求失败'}：${missing.join('、')}`
      : (payload?.message ?? `请求失败：${response.status}`)
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

function queryString(filters: ArchivedReportFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value?.trim()) params.set(key, value.trim())
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const api = {
  async login(username: string, password: string) {
    return request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  },

  async me() {
    return request<MeResponse>('/api/auth/me')
  },

  async reports() {
    return request<ReportListResponse>('/api/reports')
  },

  async reviewQueue() {
    return request<ReviewQueueResponse>('/api/reports/review/queue')
  },

  async reviewHistory(allReviewers = false) {
    return request<ReviewQueueResponse>(
      allReviewers ? '/api/reports/review/history/all' : '/api/reports/review/history'
    )
  },

  async archivedSummary(filters: ArchivedReportFilters) {
    return request<ArchivedSummary>(`/api/reports/archived/summary${queryString(filters)}`)
  },

  async archivedModelSummary(filters: ArchivedReportFilters) {
    return request<{ items: ArchivedSummaryRow[] }>(`/api/reports/archived/model-summary${queryString(filters)}`)
  },

  async archivedL2Summary(filters: ArchivedReportFilters) {
    return request<{ items: ArchivedSummaryRow[] }>(`/api/reports/archived/l2-summary${queryString(filters)}`)
  },

  async archivedL1Summary(filters: ArchivedReportFilters) {
    return request<{ items: ArchivedSummaryRow[] }>(`/api/reports/archived/l1-summary${queryString(filters)}`)
  },

  async archivedFlowSummary(filters: ArchivedReportFilters) {
    return request<{ items: ArchivedSummaryRow[] }>(`/api/reports/archived/flow-summary${queryString(filters)}`)
  },

  async archivedDetail(filters: ArchivedReportFilters) {
    return request<{ items: ArchivedDetailRow[]; total: number }>(`/api/reports/archived/detail${queryString(filters)}`)
  },

  async exportArchived(filters: ArchivedReportFilters) {
    const token = getStoredToken()
    const response = await fetch(`${apiBaseUrl}/api/reports/archived/export${queryString(filters)}`, {
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null
      throw new Error(payload?.message ?? `导出失败：${response.status}`)
    }

    return response.blob()
  },

  async reviewReport(id: string) {
    return request<ReportDetailResponse>(`/api/reports/review/${id}`)
  },

  async approveReport(id: string) {
    return request<ReportDetailResponse>(`/api/reports/${id}/approve`, {
      method: 'POST'
    })
  },

  async rejectReport(id: string, rejectionReason: string) {
    return request<ReportDetailResponse>(`/api/reports/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason })
    })
  },

  async withdrawReview(id: string) {
    return request<ReportDetailResponse>(`/api/reports/${id}/review-withdraw`, {
      method: 'POST'
    })
  },

  async uploadInvoice(file: File) {
    const formData = new FormData()
    formData.append('file', file)

    return request<ReportDetailResponse>('/api/reports', {
      method: 'POST',
      body: formData
    })
  },

  async report(id: string) {
    return request<ReportDetailResponse>(`/api/reports/${id}`)
  },

  async saveDraft(id: string, payload: SaveDraftPayload) {
    return request<ReportDetailResponse>(`/api/reports/${id}/draft`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  async submitReport(id: string) {
    return request<ReportDetailResponse>(`/api/reports/${id}/submit`, {
      method: 'POST'
    })
  },

  async resetDemo() {
    return request<{ message: string }>('/api/reports/reset-demo', {
      method: 'POST'
    })
  },

  async invoiceBlob(id: string) {
    const token = getStoredToken()
    const response = await fetch(`${apiBaseUrl}/api/reports/${id}/invoice`, {
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined
    })

    if (!response.ok) {
      throw new Error(`发票文件读取失败：${response.status}`)
    }

    return response.blob()
  }
}
