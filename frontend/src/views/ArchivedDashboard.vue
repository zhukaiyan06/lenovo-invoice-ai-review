<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { showToast } from 'vant'
import AdminHeader from '@/components/AdminHeader.vue'
import {
  api,
  type ArchivedDetailRow,
  type ArchivedReportFilters,
  type ArchivedSummary,
  type ArchivedSummaryRow
} from '@/api/client'

type SummaryView = 'model' | 'l2' | 'l1' | 'flow'

const loading = ref(true)
const exporting = ref(false)
const activeView = ref<SummaryView>('model')
const filters = reactive<ArchivedReportFilters>({
  l2: '',
  l1: '',
  model: '',
  itemName: '',
  province: '',
  prefectureCity: '',
  city: '',
  invoiceNo: ''
})
const summary = ref<ArchivedSummary | null>(null)
const modelRows = ref<ArchivedSummaryRow[]>([])
const l2Rows = ref<ArchivedSummaryRow[]>([])
const l1Rows = ref<ArchivedSummaryRow[]>([])
const flowRows = ref<ArchivedSummaryRow[]>([])
const detailRows = ref<ArchivedDetailRow[]>([])

const activeRows = computed(() => {
  if (activeView.value === 'model') return modelRows.value
  if (activeView.value === 'l2') return l2Rows.value
  if (activeView.value === 'l1') return l1Rows.value
  return flowRows.value
})

onMounted(loadDashboard)

async function loadDashboard() {
  loading.value = true
  try {
    const [
      summaryResult,
      modelResult,
      l2Result,
      l1Result,
      flowResult,
      detailResult
    ] = await Promise.all([
      api.archivedSummary(filters),
      api.archivedModelSummary(filters),
      api.archivedL2Summary(filters),
      api.archivedL1Summary(filters),
      api.archivedFlowSummary(filters),
      api.archivedDetail(filters)
    ])

    summary.value = summaryResult
    modelRows.value = modelResult.items
    l2Rows.value = l2Result.items
    l1Rows.value = l1Result.items
    flowRows.value = flowResult.items
    detailRows.value = detailResult.items
  } catch (error) {
    showToast(error instanceof Error ? error.message : '归档数据加载失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  for (const key of Object.keys(filters) as Array<keyof ArchivedReportFilters>) {
    filters[key] = ''
  }
  void loadDashboard()
}

async function exportExcel() {
  exporting.value = true
  try {
    const blob = await api.exportArchived(filters)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `归档报备数据-${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    showToast('导出已开始下载')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导出失败')
  } finally {
    exporting.value = false
  }
}

function numberText(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '-'
}

function moneyText(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? `¥${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-'
}
</script>

<template>
  <main class="archive-shell">
    <AdminHeader />
    <div class="archive-workspace">
      <section class="archive-heading">
        <div>
          <p class="eyebrow">Archived data</p>
          <h1>归档数据看板</h1>
          <p>基于已审核通过并归档的报备数据，按 L2、L1 和产品具体型号查看销售流向。</p>
        </div>
        <button class="export-button" type="button" :disabled="exporting || loading" @click="exportExcel">
          <van-icon name="down" /> {{ exporting ? '正在导出' : '导出 Excel' }}
        </button>
      </section>

      <section class="filters-panel" aria-label="归档数据筛选">
        <label><span>L2 经销商</span><input v-model="filters.l2" placeholder="销售方名称" /></label>
        <label><span>L1 购买方</span><input v-model="filters.l1" placeholder="购买方名称" /></label>
        <label><span>产品型号</span><input v-model="filters.model" placeholder="产品具体型号" /></label>
        <label><span>商品名称</span><input v-model="filters.itemName" placeholder="商品名称" /></label>
        <label><span>省</span><input v-model="filters.province" placeholder="省" /></label>
        <label><span>地市</span><input v-model="filters.prefectureCity" placeholder="地市" /></label>
        <label><span>城市</span><input v-model="filters.city" placeholder="城市" /></label>
        <label><span>发票号</span><input v-model="filters.invoiceNo" placeholder="发票号码" /></label>
        <div class="filter-actions">
          <button type="button" :disabled="loading" @click="loadDashboard">查询</button>
          <button type="button" :disabled="loading" @click="resetFilters">重置</button>
        </div>
      </section>

      <section class="metric-strip" aria-label="归档数据指标">
        <div><span>归档报备单</span><strong>{{ numberText(summary?.archivedReportTotal) }}</strong></div>
        <div><span>商品明细行</span><strong>{{ numberText(summary?.detailRowTotal) }}</strong></div>
        <div><span>数量合计</span><strong>{{ numberText(summary?.quantityTotal) }}</strong></div>
        <div><span>金额合计</span><strong>{{ moneyText(summary?.amountTotal) }}</strong></div>
        <div><span>L2 数量</span><strong>{{ numberText(summary?.l2Total) }}</strong></div>
        <div><span>L1 数量</span><strong>{{ numberText(summary?.l1Total) }}</strong></div>
        <div><span>型号数量</span><strong>{{ numberText(summary?.modelTotal) }}</strong></div>
      </section>

      <section class="summary-section">
        <div class="section-title">
          <div>
            <h2>汇总视图</h2>
            <p>汇总只用于看板分析，Excel 明细仍保留每一条商品明细行。</p>
          </div>
          <div class="view-tabs">
            <button :class="{ active: activeView === 'model' }" @click="activeView = 'model'">型号</button>
            <button :class="{ active: activeView === 'l2' }" @click="activeView = 'l2'">L2</button>
            <button :class="{ active: activeView === 'l1' }" @click="activeView = 'l1'">L1</button>
            <button :class="{ active: activeView === 'flow' }" @click="activeView = 'flow'">流向</button>
          </div>
        </div>

        <div class="summary-table">
          <div class="summary-head">
            <span>维度</span><span v-if="activeView === 'flow'">购买方 / 型号</span><span>数量合计</span><span>金额合计</span><span>报备单</span><span>发票</span>
          </div>
          <div v-if="loading" class="empty">正在读取归档数据…</div>
          <div v-else-if="activeRows.length === 0" class="empty">当前筛选下没有归档数据</div>
          <div v-for="row in activeRows.slice(0, 30)" v-else :key="JSON.stringify(row)" class="summary-row">
            <span class="primary-cell">
              <strong v-if="activeView === 'model'">{{ row.productSpecificModel || '-' }}</strong>
              <strong v-else-if="activeView === 'l2'">{{ row.l2Name || '-' }}</strong>
              <strong v-else-if="activeView === 'l1'">{{ row.l1Name || '-' }}</strong>
              <strong v-else>{{ row.l2Name || '-' }}</strong>
              <small v-if="activeView === 'model'">{{ row.invoiceItemName || '-' }}</small>
              <small v-else-if="activeView === 'l2'">{{ row.l2CreditCode || '-' }}</small>
              <small v-else-if="activeView === 'l1'">{{ row.l1CreditCode || '-' }}</small>
              <small v-else>{{ row.l2CreditCode || '-' }}</small>
            </span>
            <span v-if="activeView === 'flow'" class="primary-cell">
              <strong>{{ row.l1Name || '-' }}</strong>
              <small>{{ row.productSpecificModel || '-' }} · {{ row.invoiceItemName || '-' }}</small>
            </span>
            <span>{{ numberText(row.quantityTotal) }}</span>
            <span>{{ moneyText(row.amountTotal) }}</span>
            <span>{{ numberText(row.reportTotal) }}</span>
            <span>{{ numberText(row.invoiceTotal) }}</span>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <div class="section-title">
          <div>
            <h2>明细数据</h2>
            <p>一行对应一条商品明细行；一张发票包含多个型号时会展开为多行。</p>
          </div>
          <span>{{ numberText(detailRows.length) }} 行</span>
        </div>

        <div class="detail-table">
          <div class="detail-head">
            <span>发票 / 报备单</span><span>L2 经销商</span><span>L1 购买方</span><span>商品 / 型号</span><span>数量</span><span>金额</span><span>区域</span>
          </div>
          <div v-if="loading" class="empty">正在读取明细数据…</div>
          <div v-else-if="detailRows.length === 0" class="empty">当前筛选下没有明细数据</div>
          <div v-for="row in detailRows.slice(0, 50)" v-else :key="row.itemId" class="detail-row">
            <span class="primary-cell"><strong>{{ row.invoiceNo || '-' }}</strong><small>#{{ row.reportId }}</small></span>
            <span class="primary-cell"><strong>{{ row.l2Name || '-' }}</strong><small>{{ row.l2CreditCode || '-' }}</small></span>
            <span class="primary-cell"><strong>{{ row.l1Name || '-' }}</strong><small>{{ row.l1CreditCode || '-' }}</small></span>
            <span class="primary-cell"><strong>{{ row.productSpecificModel || '-' }}</strong><small>{{ row.invoiceItemName || '-' }}</small></span>
            <span>{{ row.purchaseQuantity || '-' }}</span>
            <span>{{ moneyText(row.lineAmount) }}</span>
            <span>{{ [row.province, row.prefectureCity, row.city].filter(Boolean).join(' / ') || '-' }}</span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.archive-shell { min-height: 100vh; background: #f3f3f1; }
.archive-workspace { max-width: 1320px; margin: 0 auto; padding: 42px 28px 72px; }
.archive-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.archive-heading h1 { margin: 0; font-family: Georgia, 'Songti SC', serif; font-size: 36px; font-weight: 500; letter-spacing: 0; }
.archive-heading p:last-child { margin: 9px 0 0; color: #6b7280; font-size: 14px; }
.export-button { display: inline-flex; align-items: center; gap: 7px; padding: 10px 14px; border: 1px solid #1f2937; border-radius: 4px; background: #1f2937; color: #fff; cursor: pointer; }
.export-button:disabled { opacity: .6; cursor: not-allowed; }
.filters-panel { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: 12px; margin-top: 28px; padding: 16px; border: 1px solid #d5d6d8; border-radius: 6px; background: #fff; }
.filters-panel label { display: grid; gap: 5px; color: #6b7280; font-size: 11px; }
.filters-panel input { width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid #d6d7da; border-radius: 4px; color: #111827; }
.filter-actions { display: flex; align-items: end; gap: 8px; }
.filter-actions button { padding: 8px 12px; border: 1px solid #d0d2d5; border-radius: 4px; background: #fff; color: #374151; cursor: pointer; }
.filter-actions button:first-child { border-color: #e2231a; background: #e2231a; color: #fff; }
.metric-strip { display: grid; grid-template-columns: repeat(7, 1fr); margin-top: 24px; border-block: 1px solid #cfd1d4; }
.metric-strip div { display: grid; gap: 8px; padding: 17px 16px; border-right: 1px solid #cfd1d4; }
.metric-strip div:last-child { border-right: 0; }
.metric-strip span { color: #6b7280; font-size: 11px; }
.metric-strip strong { font-family: Georgia, serif; font-size: 25px; font-weight: 500; }
.summary-section, .detail-section { margin-top: 28px; }
.section-title { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
.section-title h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
.section-title p { margin: 6px 0 0; color: #6b7280; font-size: 12px; }
.section-title > span { color: #6b7280; font-size: 12px; }
.view-tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid #d5d6d8; border-radius: 5px; background: #fff; }
.view-tabs button { padding: 7px 13px; border: 0; border-radius: 3px; background: transparent; color: #6b7280; font-size: 12px; cursor: pointer; }
.view-tabs button.active { background: #20262f; color: #fff; }
.summary-table, .detail-table { overflow: hidden; border: 1px solid #d7d8da; border-radius: 6px; background: #fff; }
.summary-head, .summary-row { display: grid; grid-template-columns: minmax(220px, 1.5fr) minmax(180px, 1.25fr) 110px 120px 90px 80px; align-items: center; gap: 14px; padding: 13px 16px; }
.summary-head { background: #e9e9e7; color: #6b7280; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.summary-row, .detail-row { border-top: 1px solid #ececef; color: #374151; font-size: 12px; }
.primary-cell { display: grid; gap: 4px; min-width: 0; }
.primary-cell strong, .primary-cell small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.primary-cell strong { color: #111827; font-size: 12px; }
.primary-cell small { color: #777b82; font-size: 10px; }
.detail-head, .detail-row { display: grid; grid-template-columns: minmax(155px, 1fr) minmax(170px, 1.1fr) minmax(170px, 1.1fr) minmax(170px, 1.1fr) 70px 90px minmax(135px, .9fr); align-items: center; gap: 12px; padding: 13px 16px; }
.detail-head { background: #e9e9e7; color: #6b7280; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.empty { padding: 48px 18px; border-top: 1px solid #ececef; color: #6b7280; text-align: center; }
@media (max-width: 1100px) {
  .filters-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .filter-actions { align-items: center; }
  .metric-strip { grid-template-columns: repeat(3, 1fr); }
  .summary-head { display: none; }
  .summary-row { grid-template-columns: 1fr 1fr auto; }
  .summary-row span:nth-last-child(-n+2) { display: none; }
  .detail-head { display: none; }
  .detail-row { grid-template-columns: 1.2fr 1fr auto; }
  .detail-row span:nth-child(3), .detail-row span:nth-child(7) { display: none; }
}
@media (max-width: 700px) {
  .archive-workspace { padding: 30px 18px 86px; }
  .archive-heading { align-items: flex-start; }
  .archive-heading h1 { font-size: 30px; }
  .filters-panel { grid-template-columns: 1fr; }
  .metric-strip { grid-template-columns: repeat(2, 1fr); }
  .section-title { align-items: flex-start; flex-direction: column; }
  .summary-row, .detail-row { grid-template-columns: 1fr auto; }
}
</style>
