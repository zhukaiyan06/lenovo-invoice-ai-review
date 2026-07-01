<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import AdminHeader from '@/components/AdminHeader.vue'
import { api, type ReportDetail } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const processing = ref(false)
const report = ref<ReportDetail | null>(null)
const invoiceObjectUrl = ref<string | null>(null)
const rejectOpen = ref(false)
const rejectionReason = ref('')
const showAllLogs = ref(false)

const pending = computed(() => report.value?.status.startsWith('待人工审批-') ?? false)
const processed = computed(() => ['已锁定 / 审核归档', '已驳回'].includes(report.value?.status ?? ''))
const canWithdraw = computed(() => {
  if (!report.value || !processed.value || !report.value.reviewer) return false
  return auth.isSupervisor || report.value.reviewer.username === auth.currentUser?.username
})
const invoiceIsImage = computed(() => report.value?.invoiceFile?.mimeType.startsWith('image/') ?? false)
const recentLogs = computed(() => showAllLogs.value ? report.value?.logs ?? [] : report.value?.logs.slice(0, 5) ?? [])
const criticalFields = new Set(['invoiceNo', 'buyerCreditCode', 'sellerCreditCode', 'totalTaxIncludedAmount'])
const compareFields = [
  ['invoiceNo', '发票号码'], ['invoiceDate', '开票日期'],
  ['buyerName', '购买方'], ['buyerCreditCode', '购买方统一代码'],
  ['sellerName', '销售方'], ['sellerCreditCode', '销售方统一代码'],
  ['totalTaxIncludedAmount', '价税合计'], ['totalAmount', '不含税金额'], ['totalTaxAmount', '税额']
] as const
const diffRows = computed(() => compareFields.map(([key, label]) => {
  const ocr = report.value?.ocrResult?.raw?.[key]
  const submitted = report.value?.fields?.[key]
  const changed = normalized(ocr) !== normalized(submitted)
  return {
    key,
    label,
    ocr: valueText(ocr),
    submitted: valueText(submitted),
    changed,
    critical: changed && criticalFields.has(key),
    manual: changed && !normalized(ocr) && Boolean(normalized(submitted))
  }
}))
const changedTotal = computed(() => diffRows.value.filter((field) => field.changed).length)

onMounted(loadReport)
onBeforeUnmount(revokeInvoiceUrl)

function revokeInvoiceUrl() {
  if (invoiceObjectUrl.value) URL.revokeObjectURL(invoiceObjectUrl.value)
  invoiceObjectUrl.value = null
}

async function loadReport() {
  loading.value = true
  try {
    const id = String(route.params.id)
    const result = await api.reviewReport(id)
    report.value = result.report
    revokeInvoiceUrl()
    if (result.report.invoiceFile) {
      const blob = await api.invoiceBlob(id)
      invoiceObjectUrl.value = URL.createObjectURL(blob)
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '报备单加载失败')
  } finally {
    loading.value = false
  }
}

function normalized(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function valueText(value: unknown) {
  return normalized(value) || '—'
}

function timeText(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—'
}

function operationLabel(type: string) {
  return ({
    UPLOAD_INVOICE: '上传发票', OCR_PREFILL: 'OCR 识别预填', FIELD_UPDATE: '修改字段',
    SUBMIT_REPORT: '提交报备', AI_LABEL: 'AI 风险判断', APPROVE_REPORT: '通过审批',
    REJECT_REPORT: '驳回审批', WITHDRAW_REVIEW: '撤回审批决议'
  } as Record<string, string>)[type] ?? type
}

async function approve() {
  if (!report.value || !pending.value) return
  try {
    await showConfirmDialog({
      title: '确认通过报备单？',
      message: 'AI 线索仅供参考。确认后报备单将锁定并进入审核归档。',
      confirmButtonText: '确认通过',
      confirmButtonColor: '#157347'
    })
  } catch { return }
  processing.value = true
  try {
    report.value = (await api.approveReport(report.value.id)).report
    showToast('审批已通过，操作已写入日志')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '审批失败')
  } finally { processing.value = false }
}

async function reject() {
  if (!report.value || !pending.value) return
  const reason = rejectionReason.value.trim()
  if (!reason) {
    showToast('请填写驳回原因')
    return
  }
  processing.value = true
  try {
    report.value = (await api.rejectReport(report.value.id, reason)).report
    rejectOpen.value = false
    rejectionReason.value = ''
    showToast('报备单已驳回，操作已写入日志')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '驳回失败')
  } finally { processing.value = false }
}

async function withdraw() {
  if (!report.value || !canWithdraw.value) return
  try {
    await showConfirmDialog({
      title: auth.isSupervisor ? '确认撤回该审核员的决议？' : '确认撤回自己的审批决议？',
      message: `撤回后状态将从“${report.value.status}”变为“待 L2 确认”，原审批记录仍会保留在日志中。`,
      confirmButtonText: '确认撤回',
      confirmButtonColor: '#e2231a'
    })
  } catch { return }
  processing.value = true
  try {
    report.value = (await api.withdrawReview(report.value.id)).report
    showToast('审批决议已撤回，操作已写入日志')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '撤回失败')
  } finally { processing.value = false }
}
</script>

<template>
  <main class="audit-detail-shell">
    <AdminHeader />
    <div v-if="loading" class="audit-loading">正在读取报备内容…</div>

    <template v-else-if="report">
      <section class="audit-titlebar">
        <div class="title-copy">
          <button type="button" @click="router.back()"><van-icon name="arrow-left" /> 返回</button>
          <div class="audit-label-line">
            <van-tag :type="report.aiLabel === '异常' ? 'danger' : 'success'" size="medium">AI {{ report.aiLabel }}</van-tag>
            <span>{{ report.status }}</span>
          </div>
          <h1>{{ report.fields?.invoiceNo || '未填写发票号' }}</h1>
          <p>#{{ report.id }} · {{ report.owner?.orgName }}</p>
        </div>
        <dl>
          <div><dt>价税合计</dt><dd>¥{{ valueText(report.fields?.totalTaxIncludedAmount) }}</dd></div>
          <div><dt>提交时间</dt><dd>{{ timeText(report.submittedAt) }}</dd></div>
          <div><dt>当前审批人</dt><dd>{{ report.reviewer?.username || '待处理' }}</dd></div>
        </dl>
      </section>

      <div class="audit-layout">
        <aside class="invoice-pane">
          <div class="pane-heading"><h2>发票原件</h2><a v-if="invoiceObjectUrl" :href="invoiceObjectUrl" target="_blank">新窗口打开</a></div>
          <div class="invoice-document">
            <img v-if="invoiceIsImage && invoiceObjectUrl" :src="invoiceObjectUrl" alt="待审核发票原件" />
            <a v-else-if="invoiceObjectUrl" :href="invoiceObjectUrl" target="_blank">打开发票文件</a>
            <p v-else>暂无发票文件</p>
          </div>
          <dl class="invoice-summary">
            <div><dt>购买方</dt><dd>{{ valueText(report.fields?.buyerName) }}</dd></div>
            <div><dt>销售方</dt><dd>{{ valueText(report.fields?.sellerName) }}</dd></div>
            <div><dt>OCR 状态</dt><dd>{{ report.ocrResult?.status || '—' }} · {{ Math.round((report.ocrResult?.confidence || 0) * 100) }}%</dd></div>
          </dl>
        </aside>

        <div class="content-pane">
          <section v-if="processed" class="decision-banner" :class="{ rejected: report.status === '已驳回' }">
            <div><strong>{{ report.status === '已驳回' ? '该报备单已驳回' : '该报备单已通过并归档' }}</strong><span>{{ report.reviewer?.username }} · {{ timeText(report.reviewedAt) }}</span></div>
            <p v-if="report.rejectionReason">驳回原因：{{ report.rejectionReason }}</p>
          </section>

          <section class="audit-section risk-section">
            <div class="section-heading"><div><p>AI RISK SIGNAL</p><h2>AI 异常线索</h2></div><span>AI 只提示风险，不代替人工审批</span></div>
            <p v-if="report.anomalyReasons.length === 0" class="clean-result">未命中异常规则，可按普通报备单继续核验。</p>
            <ul v-else class="anomaly-list">
              <li v-for="reason in report.anomalyReasons" :key="reason.code"><strong>{{ reason.code }}</strong><span>{{ reason.message }}</span></li>
            </ul>
          </section>

          <section class="audit-section diff-section">
            <div class="section-heading">
              <div><p>FIELD EVIDENCE</p><h2>OCR 原值 vs L2 提交值</h2></div>
              <span :class="{ warning: changedTotal > 0 }">{{ changedTotal }} 个字段存在差异</span>
            </div>
            <div class="diff-table">
              <div class="diff-head"><span>字段</span><span>OCR 原值</span><span>L2 提交值</span><span>判断</span></div>
              <div v-for="field in diffRows" :key="field.key" class="diff-row" :class="{ changed: field.changed, critical: field.critical }">
                <span class="field-name">{{ field.label }}</span>
                <span>{{ field.ocr }}</span>
                <span>{{ field.submitted }}</span>
                <span class="diff-state">
                  <em v-if="field.critical">关键字段修改</em>
                  <em v-else-if="field.manual" class="manual">人工补录</em>
                  <small v-else-if="field.changed">存在差异</small>
                  <small v-else class="same">一致</small>
                </span>
              </div>
            </div>
          </section>

          <section class="audit-section">
            <div class="section-heading"><div><p>LINE ITEMS</p><h2>产品明细</h2></div><span>共 {{ report.items.length }} 行</span></div>
            <div class="item-table">
              <div class="item-head"><span>发票项目 / 规格</span><span>产品具体型号</span><span>数量</span><span>金额 / 税额</span></div>
              <div v-for="item in report.items" :key="item.id" class="item-line">
                <span><strong>{{ item.invoiceItemName || '—' }}</strong><small>{{ item.invoiceSpecModel || '—' }}</small></span>
                <span>{{ item.productSpecificModel || '—' }}</span><span>{{ item.purchaseQuantity || '—' }} {{ item.unit || '' }}</span><span>{{ item.lineAmount || '—' }} / {{ item.lineTaxAmount || '—' }}</span>
              </div>
            </div>
          </section>

          <section class="audit-section logs-section">
            <div class="section-heading"><div><p>AUDIT TRAIL</p><h2>操作日志</h2></div><button v-if="report.logs.length > 5" @click="showAllLogs = !showAllLogs">{{ showAllLogs ? '收起' : `查看全部 ${report.logs.length} 条` }}</button></div>
            <ol class="log-list">
              <li v-for="log in recentLogs" :key="log.id">
                <span class="log-dot"></span>
                <div><strong>{{ operationLabel(log.operationType) }}</strong><small>{{ log.operator?.username || '系统 / L2' }} · {{ timeText(log.createdAt) }}</small><p v-if="log.fieldName">{{ log.fieldName }}：{{ valueText(log.beforeValue) }} → {{ valueText(log.afterValue) }}</p></div>
              </li>
            </ol>
          </section>
        </div>
      </div>

      <footer v-if="pending || canWithdraw" class="decision-bar">
        <p><strong>{{ pending ? '等待人工决策' : '已作出审批决议' }}</strong><span>{{ pending ? '核对原件、字段差异与 AI 线索后作出决议。' : '仅原审批人或主管可以撤回该决议。' }}</span></p>
        <div>
          <van-button v-if="canWithdraw" type="danger" plain :loading="processing" @click="withdraw">撤回决议</van-button>
          <template v-if="pending"><van-button :disabled="processing" @click="rejectOpen = true">驳回</van-button><van-button type="primary" color="#157347" :loading="processing" @click="approve">通过并归档</van-button></template>
        </div>
      </footer>
    </template>

    <van-popup v-model:show="rejectOpen" position="bottom" round class="reject-sheet">
      <div class="reject-content"><p class="popup-kicker">REJECTION DECISION</p><h2>驳回报备单</h2><p>驳回原因会展示给 L2，并作为审批日志永久保留。</p><van-field v-model="rejectionReason" type="textarea" rows="4" maxlength="200" show-word-limit placeholder="请输入明确、可执行的驳回原因" /><div class="reject-actions"><van-button block :disabled="processing" @click="rejectOpen = false">取消</van-button><van-button block type="danger" :loading="processing" @click="reject">确认驳回</van-button></div></div>
    </van-popup>
  </main>
</template>

<style scoped>
.audit-detail-shell { min-height: 100vh; padding-bottom: 90px; background: #f3f3f1; }.audit-loading { padding: 100px 24px; color: #6b7280; text-align: center; }
.audit-titlebar { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; max-width: 1280px; margin: 0 auto; padding: 34px 28px 28px; border-bottom: 1px solid #d4d5d7; }.title-copy > button { display: flex; align-items: center; gap: 5px; margin-bottom: 20px; padding: 0; border: 0; background: transparent; color: #6b7280; font-size: 12px; cursor: pointer; }.audit-label-line { display: flex; align-items: center; gap: 10px; }.audit-label-line > span { color: #6b7280; font-size: 12px; }.audit-titlebar h1 { margin: 11px 0 0; font-family: Georgia, serif; font-size: 31px; font-weight: 500; }.audit-titlebar p { margin: 7px 0 0; color: #6b7280; font-size: 11px; }.audit-titlebar dl { display: flex; gap: 28px; margin: 0; }.audit-titlebar dl div { display: grid; gap: 5px; }.audit-titlebar dt { color: #73777e; font-size: 10px; text-transform: uppercase; }.audit-titlebar dd { margin: 0; font-family: Georgia, 'Songti SC', serif; font-size: 14px; }
.audit-layout { display: grid; grid-template-columns: minmax(350px, .78fr) minmax(560px, 1.22fr); gap: 22px; max-width: 1280px; margin: 0 auto; padding: 26px 28px 40px; }.invoice-pane { position: sticky; top: 92px; align-self: start; min-width: 0; }.content-pane { display: grid; gap: 16px; min-width: 0; }.pane-heading, .section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 13px; }.pane-heading h2, .section-heading h2 { margin: 2px 0 0; font-size: 15px; }.section-heading p { margin: 0; color: #e2231a; font-size: 9px; font-weight: 900; letter-spacing: .13em; }.section-heading > span { color: #7c8188; font-size: 10px; }.section-heading > span.warning { color: #b42318; font-weight: 700; }.pane-heading a, .section-heading button { padding: 0; border: 0; background: transparent; color: #e2231a; font-size: 11px; cursor: pointer; text-decoration: none; }
.invoice-document { min-height: 400px; overflow: hidden; border: 1px solid #cfd1d3; border-radius: 5px; background: #dcddde; }.invoice-document img { display: block; width: 100%; height: auto; }.invoice-document > a, .invoice-document > p { display: block; padding: 100px 20px; color: #e2231a; text-align: center; }.invoice-summary { margin: 0; border: 1px solid #d4d5d7; border-top: 0; background: #fff; }.invoice-summary div { display: grid; grid-template-columns: 76px 1fr; gap: 12px; padding: 10px 12px; border-top: 1px solid #ececef; }.invoice-summary dt { color: #777b82; font-size: 10px; }.invoice-summary dd { margin: 0; font-size: 11px; }
.audit-section, .decision-banner { padding: 19px; border: 1px solid #d8d9db; border-radius: 5px; background: #fff; }.risk-section { border-top: 3px solid #e2231a; }.clean-result { margin: 0; padding: 13px; background: #f1f8f3; color: #157347; font-size: 12px; }.anomaly-list { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }.anomaly-list li { display: grid; grid-template-columns: minmax(135px, auto) 1fr; gap: 14px; padding: 11px 13px; border-left: 3px solid #c9332b; background: #fff5f3; }.anomaly-list strong { color: #9f211a; font-size: 10px; }.anomaly-list span { color: #374151; font-size: 12px; }
.diff-table { border: 1px solid #e0e1e3; }.diff-head, .diff-row { display: grid; grid-template-columns: 1fr 1.35fr 1.35fr 105px; gap: 12px; align-items: center; padding: 10px 12px; }.diff-head { background: #eeeeec; color: #73777e; font-size: 9px; font-weight: 800; letter-spacing: .05em; }.diff-row { border-top: 1px solid #ececef; color: #374151; font-size: 11px; }.diff-row.changed { background: #fff9ed; }.diff-row.critical { box-shadow: inset 3px 0 #e2231a; background: #fff2ef; }.field-name { color: #111827; font-weight: 700; }.diff-state em, .diff-state small { display: inline-block; padding: 3px 5px; border-radius: 2px; background: #fee4e2; color: #b42318; font-size: 9px; font-style: normal; font-weight: 700; }.diff-state em.manual { background: #fff0c7; color: #8a5a00; }.diff-state small { background: #fff0c7; color: #8a5a00; }.diff-state small.same { background: transparent; color: #788078; font-weight: 400; }
.item-table { border-top: 1px solid #e2e3e5; }.item-head, .item-line { display: grid; grid-template-columns: 1.5fr 1.2fr .6fr 1fr; gap: 12px; align-items: center; padding: 11px 0; }.item-head { color: #84888e; font-size: 9px; font-weight: 700; }.item-line { border-top: 1px solid #ececef; color: #374151; font-size: 11px; }.item-line > span:first-child { display: grid; gap: 3px; }.item-line strong { color: #111827; font-size: 11px; }.item-line small { color: #888c92; }
.log-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }.log-list li { position: relative; display: grid; grid-template-columns: 16px 1fr; gap: 9px; padding: 0 0 15px; }.log-list li:not(:last-child)::before { position: absolute; top: 8px; bottom: 0; left: 4px; width: 1px; background: #d5d7d9; content: ''; }.log-dot { z-index: 1; width: 9px; height: 9px; margin-top: 3px; border: 2px solid #fff; border-radius: 50%; background: #e2231a; box-shadow: 0 0 0 1px #e2231a; }.log-list div { display: grid; gap: 3px; }.log-list strong { font-size: 11px; }.log-list small { color: #7b7f85; font-size: 10px; }.log-list p { margin: 2px 0 0; color: #535860; font-size: 10px; line-height: 1.45; }
.decision-banner { display: grid; gap: 8px; border-color: #b8ddc4; background: #f0f8f2; }.decision-banner.rejected { border-color: #f0c2bd; background: #fff4f2; }.decision-banner div { display: flex; justify-content: space-between; gap: 18px; }.decision-banner strong { color: #146c43; font-size: 12px; }.decision-banner.rejected strong { color: #a12720; }.decision-banner span, .decision-banner p { margin: 0; color: #6b7280; font-size: 10px; }.decision-banner.rejected p { color: #8f2822; }
.decision-bar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 9; display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 13px max(28px, calc((100vw - 1224px) / 2)); border-top: 1px solid #cfd1d3; background: rgba(255,255,255,.97); box-shadow: 0 -8px 28px rgba(17,24,39,.07); backdrop-filter: blur(12px); }.decision-bar p { display: grid; gap: 3px; margin: 0; }.decision-bar strong { font-size: 12px; }.decision-bar span { color: #6b7280; font-size: 10px; }.decision-bar > div { display: flex; gap: 9px; }.reject-sheet { left: 50%; width: min(520px, 100%); transform: translateX(-50%); }.reject-content { padding: 24px 22px calc(24px + env(safe-area-inset-bottom)); }.popup-kicker { margin: 0 0 5px !important; color: #e2231a !important; font-size: 9px !important; font-weight: 900; letter-spacing: .13em; }.reject-content h2 { margin: 0; font-family: Georgia, 'Songti SC', serif; font-size: 22px; font-weight: 500; }.reject-content > p { margin: 8px 0 16px; color: #6b7280; font-size: 12px; }.reject-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
@media (max-width: 900px) { .audit-titlebar { align-items: flex-start; }.audit-titlebar dl { display: none; }.audit-layout { grid-template-columns: 1fr; }.invoice-pane { position: static; }.invoice-document { min-height: 0; max-height: 500px; overflow: auto; } }
@media (max-width: 620px) { .audit-titlebar, .audit-layout { padding-inline: 18px; }.diff-head { display: none; }.diff-row { grid-template-columns: 1fr 1fr; }.diff-state { grid-column: 2; }.item-head { display: none; }.item-line { grid-template-columns: 1fr 1fr; }.decision-bar { bottom: 52px; padding-inline: 18px; }.decision-bar p { display: none; }.decision-bar > div { width: 100%; }.decision-bar .van-button { flex: 1; } }
</style>
