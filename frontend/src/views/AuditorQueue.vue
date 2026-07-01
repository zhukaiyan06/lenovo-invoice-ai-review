<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import AdminHeader from '@/components/AdminHeader.vue'
import { api, type ReviewQueueItem } from '@/api/client'

const router = useRouter()
const loading = ref(true)
const items = ref<ReviewQueueItem[]>([])
const aiFilter = ref<'all' | 'normal' | 'anomaly'>('all')
const statusFilter = ref('all')

const filteredItems = computed(() => items.value.filter((item) => {
  const aiMatches = aiFilter.value === 'all'
    || (aiFilter.value === 'normal' && item.aiLabel === '正常')
    || (aiFilter.value === 'anomaly' && item.aiLabel === '异常')
  const statusMatches = statusFilter.value === 'all' || item.status === statusFilter.value
  return aiMatches && statusMatches
}))
const normalTotal = computed(() => items.value.filter((item) => item.aiLabel === '正常').length)
const anomalyTotal = computed(() => items.value.filter((item) => item.aiLabel === '异常').length)

onMounted(loadQueue)

async function loadQueue() {
  loading.value = true
  try {
    const result = await api.reviewQueue()
    items.value = result.items
  } catch (error) {
    showToast(error instanceof Error ? error.message : '审核队列加载失败')
  } finally {
    loading.value = false
  }
}

function anomalySummary(item: ReviewQueueItem) {
  return item.anomalyReasons[0]?.message ?? '未命中异常规则'
}

function timeText(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-'
}
</script>

<template>
  <main class="review-shell">
    <AdminHeader />
    <div class="review-workspace">
      <section class="queue-heading">
        <div>
          <p class="eyebrow">AI-assisted review</p>
          <h1>待审报备单</h1>
          <p>异常线索优先呈现，审批结论始终由人工确认。</p>
        </div>
        <button class="refresh-button" type="button" :disabled="loading" @click="loadQueue">
          <van-icon name="replay" /> 刷新队列
        </button>
      </section>

      <section class="queue-summary" aria-label="审核队列统计">
        <div><span>待审总量</span><strong>{{ items.length }}</strong></div>
        <div class="danger"><span>AI 异常</span><strong>{{ anomalyTotal }}</strong></div>
        <div class="success"><span>AI 正常</span><strong>{{ normalTotal }}</strong></div>
      </section>

      <section class="queue-toolbar">
        <div class="filter-tabs" role="tablist" aria-label="AI 标签筛选">
          <button :class="{ active: aiFilter === 'all' }" @click="aiFilter = 'all'">全部</button>
          <button :class="{ active: aiFilter === 'anomaly' }" @click="aiFilter = 'anomaly'">AI 异常</button>
          <button :class="{ active: aiFilter === 'normal' }" @click="aiFilter = 'normal'">AI 正常</button>
        </div>
        <label>
          <span>状态</span>
          <select v-model="statusFilter">
            <option value="all">全部待审状态</option>
            <option value="待人工审批-异常">待人工审批-异常</option>
            <option value="待人工审批-正常">待人工审批-正常</option>
          </select>
        </label>
        <span class="result-count">{{ filteredItems.length }} 条结果</span>
      </section>

      <section class="queue-table" aria-label="待审批报备单">
        <div class="queue-table-head">
          <span>报备单 / 发票号码</span><span>提交方</span><span>价税合计</span><span>状态 / AI</span><span>异常线索</span><span>审批人</span><span>提交时间</span><span></span>
        </div>
        <div v-if="loading" class="queue-empty">正在读取待审报备单…</div>
        <div v-else-if="filteredItems.length === 0" class="queue-empty">当前筛选下没有待审报备单</div>
        <button
          v-for="item in filteredItems"
          v-else
          :key="item.id"
          class="queue-row"
          type="button"
          @click="router.push({ name: 'review-detail', params: { id: item.id } })"
        >
          <span class="report-cell"><small>#{{ item.id }}</small><strong>{{ item.fields?.invoiceNo || '未填写发票号' }}</strong></span>
          <span class="owner-cell"><strong>{{ item.owner.orgName }}</strong><small>{{ item.owner.username }}</small></span>
          <span class="amount-cell">¥{{ item.fields?.totalTaxIncludedAmount || '-' }}</span>
          <span class="status-cell"><small>{{ item.status }}</small><van-tag :type="item.aiLabel === '异常' ? 'danger' : 'success'">AI {{ item.aiLabel }}</van-tag></span>
          <span class="reason-cell" :class="{ clean: item.aiLabel === '正常' }">{{ anomalySummary(item) }}</span>
          <span class="reviewer-cell">{{ item.reviewer?.username || '待处理' }}</span>
          <span class="time-cell">{{ timeText(item.submittedAt) }}</span>
          <span class="open-cell">审阅 <van-icon name="arrow" /></span>
        </button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.review-shell { min-height: 100vh; background: #f3f3f1; }
.review-workspace { max-width: 1280px; margin: 0 auto; padding: 42px 28px 64px; }
.queue-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.queue-heading h1 { margin: 0; font-family: Georgia, 'Songti SC', serif; font-size: 36px; font-weight: 500; letter-spacing: -.02em; }
.queue-heading p:last-child { margin: 9px 0 0; color: #6b7280; font-size: 14px; }
.refresh-button { display: inline-flex; align-items: center; gap: 7px; padding: 9px 13px; border: 1px solid #cfd1d4; border-radius: 4px; background: transparent; color: #374151; cursor: pointer; }
.queue-summary { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 34px; border-block: 1px solid #ced0d3; }
.queue-summary div { display: flex; align-items: baseline; justify-content: space-between; padding: 20px 24px; border-right: 1px solid #ced0d3; }
.queue-summary div:last-child { border-right: 0; }
.queue-summary span { color: #6b7280; font-size: 12px; text-transform: uppercase; }
.queue-summary strong { font-family: Georgia, serif; font-size: 31px; font-weight: 500; }
.queue-summary .danger strong { color: #b42318; }.queue-summary .success strong { color: #157347; }
.queue-toolbar { display: flex; align-items: center; gap: 14px; margin-top: 28px; }
.filter-tabs { display: flex; gap: 3px; padding: 3px; border: 1px solid #d5d6d8; border-radius: 5px; background: #fff; }
.filter-tabs button { padding: 7px 11px; border: 0; border-radius: 3px; background: transparent; color: #6b7280; font-size: 12px; cursor: pointer; }
.filter-tabs button.active { background: #1f2937; color: #fff; }
.queue-toolbar label { display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 12px; }
.queue-toolbar select { padding: 8px 30px 8px 10px; border: 1px solid #d5d6d8; border-radius: 4px; background: #fff; color: #374151; }
.result-count { margin-left: auto; color: #6b7280; font-size: 12px; }
.queue-table { margin-top: 14px; overflow: hidden; border: 1px solid #d7d8da; border-radius: 6px; background: #fff; }
.queue-table-head, .queue-row { display: grid; grid-template-columns: minmax(160px, 1.3fr) minmax(150px, 1.1fr) 100px minmax(135px, 1fr) minmax(150px, 1.15fr) 70px 135px 52px; align-items: center; gap: 12px; width: 100%; padding: 13px 16px; }
.queue-table-head { background: #ececea; color: #6b7280; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.queue-row { border: 0; border-top: 1px solid #ececef; background: #fff; text-align: left; cursor: pointer; transition: 130ms ease; }
.queue-row:hover { background: #faf9f7; box-shadow: inset 3px 0 #e2231a; }
.report-cell, .owner-cell, .status-cell { display: grid; gap: 5px; min-width: 0; }
.report-cell small, .owner-cell small, .status-cell small, .time-cell { overflow: hidden; color: #777b82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.report-cell strong, .owner-cell strong { overflow: hidden; color: #111827; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.amount-cell { font-family: Georgia, serif; font-size: 14px; font-variant-numeric: tabular-nums; }
.status-cell .van-tag { justify-self: start; }
.reason-cell { display: -webkit-box; overflow: hidden; color: #9b2c25; font-size: 11px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.reason-cell.clean { color: #157347; }
.reviewer-cell { color: #565b62; font-size: 11px; }
.open-cell { display: flex; align-items: center; justify-content: flex-end; gap: 4px; color: #e2231a; font-size: 12px; }
.queue-empty { padding: 56px 18px; border-top: 1px solid #eceef1; color: #6b7280; text-align: center; }
@media (max-width: 1000px) { .queue-table-head { display: none; }.queue-row { grid-template-columns: 1.3fr 1fr auto; }.owner-cell, .reason-cell, .reviewer-cell, .time-cell { display: none; } }
@media (max-width: 700px) { .review-workspace { padding: 30px 18px 86px; }.queue-heading { align-items: flex-start; }.queue-heading h1 { font-size: 30px; }.queue-summary div { padding: 16px 12px; }.queue-toolbar { flex-wrap: wrap; }.result-count { width: 100%; }.queue-row { grid-template-columns: 1fr auto; }.amount-cell, .status-cell { display: none; } }
</style>
