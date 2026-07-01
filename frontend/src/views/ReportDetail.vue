<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { api, type ReportDetail } from '@/api/client'

const route = useRoute()
const router = useRouter()
const report = ref<ReportDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const submitting = ref(false)
const invoiceObjectUrl = ref<string | null>(null)

const invoiceIsImage = computed(() => report.value?.invoiceFile?.mimeType.startsWith('image/') ?? false)
const editable = computed(() => report.value?.status === '待 L2 确认')
const aiTagType = computed(() => {
  if (report.value?.aiLabel === '异常') return 'danger'
  if (report.value?.aiLabel === '正常') return 'success'
  return 'default'
})
const formFields = ref<Record<string, string>>({})
const formItems = ref<
  Array<{
    id: string
    invoiceItemName: string | null
    invoiceSpecModel: string | null
    unit: string | null
    productSpecificModel: string
    purchaseQuantity: string
    lineAmount: string
    lineTaxAmount: string
  }>
>([])

const fieldRows = computed(() => {
  const fields = formFields.value

  return [
    { key: 'invoiceNo', label: '发票号' },
    { key: 'invoiceDate', label: '开票日期' },
    { key: 'buyerName', label: '购买方名称' },
    { key: 'buyerCreditCode', label: '购买方统一代码' },
    { key: 'sellerName', label: '销售方名称' },
    { key: 'sellerCreditCode', label: '销售方统一代码' },
    { key: 'province', label: '省份' },
    { key: 'prefectureCity', label: '地市' },
    { key: 'city', label: '城市' },
    { key: 'totalTaxIncludedAmount', label: '价税合计' },
    { key: 'totalAmount', label: '金额' },
    { key: 'totalTaxAmount', label: '税额' },
    { key: 'shipmentDate', label: '出货时间' }
  ].map((field) => ({
    ...field,
    value: fields[field.key] ?? ''
  }))
})

const ocrCompareRows = computed(() => {
  const currentReport = report.value
  const raw = currentReport?.ocrResult?.raw
  const fields = currentReport?.fields ?? {}

  if (!raw) return []

  return [
    { key: 'invoiceNo', label: '发票号' },
    { key: 'invoiceDate', label: '开票日期' },
    { key: 'buyerName', label: '购买方名称' },
    { key: 'buyerCreditCode', label: '购买方统一代码' },
    { key: 'sellerName', label: '销售方名称' },
    { key: 'sellerCreditCode', label: '销售方统一代码' },
    { key: 'province', label: '省份' },
    { key: 'prefectureCity', label: '地市' },
    { key: 'city', label: '城市' },
    { key: 'totalTaxIncludedAmount', label: '价税合计' },
    { key: 'totalAmount', label: '金额' },
    { key: 'totalTaxAmount', label: '税额' }
  ]
    .map((field) => {
      const ocrValue = valueText(raw[field.key as keyof typeof raw])
      const submittedValue = valueText(fields[field.key])
      return {
        ...field,
        ocrValue,
        submittedValue,
        changed: ocrValue !== '-' && submittedValue !== '-' && ocrValue !== submittedValue
      }
    })
    .filter((field) => field.changed || report.value?.aiLabel === '异常')
})

const submitReadyHint = computed(() => {
  if (!editable.value) return '当前状态不可编辑'
  if (!formFields.value.shipmentDate) return '提交前需补充出货时间'
  if (formItems.value.some((item) => !item.productSpecificModel)) return '提交前需补齐每行产品具体型号'
  return '字段确认后可提交后台审核'
})

onMounted(async () => {
  const id = String(route.params.id)
  try {
    const result = await api.report(id)
    applyReport(result.report)

    if (result.report.invoiceFile) {
      const blob = await api.invoiceBlob(id)
      invoiceObjectUrl.value = URL.createObjectURL(blob)
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '读取报备单失败')
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (invoiceObjectUrl.value) {
    URL.revokeObjectURL(invoiceObjectUrl.value)
  }
})

function applyReport(nextReport: ReportDetail) {
  report.value = nextReport
  formFields.value = Object.fromEntries(
    Object.entries(nextReport.fields ?? {}).map(([key, value]) => [key, value === null ? '' : String(value)])
  )
  formItems.value = nextReport.items.map((item) => ({
    id: item.id,
    invoiceItemName: item.invoiceItemName,
    invoiceSpecModel: item.invoiceSpecModel,
    unit: item.unit,
    productSpecificModel: item.productSpecificModel ?? '',
    purchaseQuantity: item.purchaseQuantity ?? '',
    lineAmount: item.lineAmount ?? '',
    lineTaxAmount: item.lineTaxAmount ?? ''
  }))
}

function draftPayload() {
  return {
    fields: Object.fromEntries(
      Object.entries(formFields.value).map(([key, value]) => [key, value.trim() || null])
    ),
    items: formItems.value.map((item) => ({
      id: item.id,
      productSpecificModel: item.productSpecificModel.trim() || null,
      purchaseQuantity: item.purchaseQuantity.trim() || null,
      lineAmount: item.lineAmount.trim() || null,
      lineTaxAmount: item.lineTaxAmount.trim() || null
    }))
  }
}

function valueText(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '') return '-'
  return String(value).trim()
}

async function saveDraft() {
  if (!report.value) return
  saving.value = true
  try {
    const result = await api.saveDraft(report.value.id, draftPayload())
    applyReport(result.report)
    showToast('草稿已保存')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function submitReport() {
  if (!report.value) return
  submitting.value = true
  try {
    const saved = await api.saveDraft(report.value.id, draftPayload())
    applyReport(saved.report)
    const result = await api.submitReport(report.value.id)
    applyReport(result.report)
    showToast('已提交审核')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="mobile-shell detail-page">
    <van-nav-bar title="报备详情" left-arrow fixed placeholder @click-left="router.back()" />

    <section v-if="loading" class="page-pad">
      <p class="page-subtitle">正在读取报备单...</p>
    </section>

    <template v-else-if="report">
      <section class="page-pad">
        <p class="eyebrow">报备单</p>
        <h1 class="page-title">{{ report.status }}</h1>
        <p class="page-subtitle">{{ report.invoiceFile?.originalName }}</p>
      </section>

      <section class="invoice-preview">
        <img v-if="invoiceIsImage && invoiceObjectUrl" :src="invoiceObjectUrl" alt="发票预览" />
        <a v-else-if="invoiceObjectUrl" :href="invoiceObjectUrl" target="_blank" rel="noreferrer">
          打开发票文件
        </a>
        <p v-else>暂无发票文件</p>
      </section>

      <section class="detail-section review-result">
        <div class="section-title-line">
          <h2>AI 审查结果</h2>
          <van-tag :type="aiTagType" size="medium">{{ report.aiLabel }}</van-tag>
        </div>
        <p v-if="report.aiLabel === '未打标'" class="muted-text">
          提交后由后端规则引擎计算 AI 标签和异常原因。
        </p>
        <template v-else>
          <ul v-if="report.anomalyReasons.length" class="reason-list">
            <li v-for="reason in report.anomalyReasons" :key="reason.code">
              <strong>{{ reason.code }}</strong>
              <span>{{ reason.message }}</span>
            </li>
          </ul>
          <p v-else class="normal-result">未命中异常规则，等待后台人工审核。</p>
        </template>
      </section>

      <section v-if="report.reviewedAt" class="detail-section decision-result">
        <div class="section-title-line">
          <h2>后台审批结果</h2>
          <van-tag :type="report.status === '已驳回' ? 'danger' : 'success'" size="medium">
            {{ report.status === '已驳回' ? '已驳回' : '已通过' }}
          </van-tag>
        </div>
        <dl>
          <div>
            <dt>审批人</dt>
            <dd>{{ report.reviewer?.username || '-' }}</dd>
          </div>
          <div>
            <dt>审批时间</dt>
            <dd>{{ new Date(report.reviewedAt).toLocaleString() }}</dd>
          </div>
          <div v-if="report.rejectionReason">
            <dt>驳回原因</dt>
            <dd class="rejection-text">{{ report.rejectionReason }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="ocrCompareRows.length" class="detail-section">
        <h2>OCR 原值与提交值差异</h2>
        <div class="compare-list">
          <article
            v-for="field in ocrCompareRows"
            :key="field.key"
            class="compare-row"
            :class="{ changed: field.changed }"
          >
            <strong>{{ field.label }}</strong>
            <div>
              <span>OCR：{{ field.ocrValue }}</span>
              <span>L2：{{ field.submittedValue }}</span>
            </div>
          </article>
        </div>
      </section>

      <section class="detail-section">
        <h2>OCR 识别</h2>
        <dl>
          <div>
            <dt>识别状态</dt>
            <dd>{{ report.ocrResult?.status || '未识别' }}</dd>
          </div>
          <div>
            <dt>置信度</dt>
            <dd>{{ report.ocrResult ? `${Math.round(report.ocrResult.confidence * 100)}%` : '-' }}</dd>
          </div>
          <div>
            <dt>识别来源</dt>
            <dd>后端 OCR provider</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h2>主表字段</h2>
        <van-cell-group inset>
          <van-field
            v-for="field in fieldRows"
            :key="field.key"
            v-model="formFields[field.key]"
            :label="field.label"
            :readonly="!editable"
            placeholder="待 L2 填写"
          />
          <van-field
            v-model="formFields.remarks"
            label="备注"
            :readonly="!editable"
            placeholder="选填"
            type="textarea"
            rows="2"
          />
        </van-cell-group>
      </section>

      <section class="detail-section">
        <h2>商品明细</h2>
        <div class="item-list">
          <article v-for="(item, index) in formItems" :key="item.id" class="item-row">
            <strong>{{ item.invoiceSpecModel || item.invoiceItemName || '商品行' }}</strong>
            <span>{{ item.invoiceItemName }} · 数量 {{ item.purchaseQuantity }} {{ item.unit }}</span>
            <van-field
              v-model="item.productSpecificModel"
              :label="`第 ${index + 1} 行型号`"
              :readonly="!editable"
              placeholder="请输入产品具体型号"
            />
            <van-field
              v-model="item.purchaseQuantity"
              label="购买数量"
              :readonly="!editable"
              placeholder="请输入数量"
            />
            <van-field
              v-model="item.lineAmount"
              label="行金额"
              :readonly="!editable"
              placeholder="请输入金额"
            />
            <van-field
              v-model="item.lineTaxAmount"
              label="行税额"
              :readonly="!editable"
              placeholder="请输入税额"
            />
          </article>
        </div>
      </section>

      <section class="submit-panel">
        <p>{{ submitReadyHint }}</p>
        <div class="submit-actions">
          <van-button :disabled="!editable" :loading="saving" block @click="saveDraft">
            保存草稿
          </van-button>
          <van-button
            :disabled="!editable"
            :loading="submitting"
            block
            type="primary"
            color="#e2231a"
            @click="submitReport"
          >
            提交审核
          </van-button>
        </div>
      </section>

      <section class="detail-section">
        <h2>文件信息</h2>
        <dl>
          <div>
            <dt>文件名</dt>
            <dd>{{ report.invoiceFile?.originalName }}</dd>
          </div>
          <div>
            <dt>文件类型</dt>
            <dd>{{ report.invoiceFile?.mimeType }}</dd>
          </div>
          <div>
            <dt>文件大小</dt>
            <dd>{{ report.invoiceFile ? (report.invoiceFile.size / 1024).toFixed(1) : '-' }} KB</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h2>操作日志</h2>
        <ul>
          <li v-for="log in report.logs" :key="log.id">
            <strong>{{ log.operationType }}</strong>
            <span>{{ new Date(log.createdAt).toLocaleString() }}</span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.detail-page {
  background: #f6f8fb;
}

.invoice-preview {
  margin: 0 18px 18px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.invoice-preview img {
  display: block;
  width: 100%;
  height: auto;
}

.invoice-preview a,
.invoice-preview p {
  display: block;
  margin: 0;
  padding: 18px;
  color: #e2231a;
  text-align: center;
}

.detail-section {
  margin: 18px;
  padding-top: 18px;
  border-top: 1px solid #e5e7eb;
}

.detail-section h2 {
  margin: 0 0 12px;
  color: #111827;
  font-size: 17px;
}

.section-title-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title-line h2 {
  margin-bottom: 0;
}

.review-result {
  display: grid;
  gap: 12px;
}

.decision-result {
  display: grid;
  gap: 12px;
}

.rejection-text {
  padding: 12px;
  border-left: 3px solid #dc2626;
  background: #fff7f7;
  color: #991b1b;
  line-height: 1.6;
}

.muted-text,
.normal-result {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.normal-result {
  color: #15803d;
}

.reason-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.reason-list li {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff7f7;
}

.reason-list strong {
  color: #b91c1c;
  font-size: 12px;
}

.reason-list span {
  color: #374151;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
}

.compare-list {
  display: grid;
  gap: 8px;
}

.compare-row {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.compare-row.changed {
  border-color: #fca5a5;
  background: #fff7f7;
}

.compare-row strong {
  color: #111827;
  font-size: 13px;
}

.compare-row div {
  display: grid;
  gap: 4px;
}

.compare-row span {
  color: #4b5563;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

dl {
  display: grid;
  gap: 10px;
  margin: 0;
}

dl div {
  display: grid;
  gap: 4px;
}

dt {
  color: #6b7280;
  font-size: 12px;
}

dd {
  margin: 0;
  color: #111827;
  font-size: 14px;
  overflow-wrap: anywhere;
}

ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

li strong {
  color: #111827;
  font-size: 13px;
}

li span {
  color: #6b7280;
  font-size: 12px;
  text-align: right;
}

.item-list {
  display: grid;
  gap: 10px;
}

.item-row {
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.item-row strong {
  color: #111827;
  font-size: 14px;
}

.item-row span {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.4;
}

.submit-panel {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: grid;
  gap: 10px;
  padding: 12px 18px 18px;
  border-top: 1px solid #e5e7eb;
  background: rgba(246, 248, 251, 0.96);
  backdrop-filter: blur(10px);
}

.submit-panel p {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
  text-align: center;
}

.submit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
</style>
