<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import AdminHeader from '@/components/AdminHeader.vue'
import { api, type ReviewQueueItem } from '@/api/client'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const items = ref<ReviewQueueItem[]>([])
const statusFilter = ref<'all' | 'approved' | 'rejected'>('all')
const aiFilter = ref<'all' | 'normal' | 'anomaly'>('all')
const isAll = computed(() => route.name === 'review-history-all')
const title = computed(() => isAll.value ? '全员审批历史' : '我的处理历史')
const subtitle = computed(() => isAll.value
  ? '查看所有审核员的处理结果，并对错误决议进行撤回。'
  : '追踪自己处理过的报备单，可撤回自己的通过或驳回决议。')
const filteredItems = computed(() => items.value.filter((item) => {
  const statusMatches = statusFilter.value === 'all'
    || (statusFilter.value === 'approved' && item.status === '已锁定 / 审核归档')
    || (statusFilter.value === 'rejected' && item.status === '已驳回')
  const aiMatches = aiFilter.value === 'all'
    || (aiFilter.value === 'normal' && item.aiLabel === '正常')
    || (aiFilter.value === 'anomaly' && item.aiLabel === '异常')
  return statusMatches && aiMatches
}))

onMounted(loadHistory)
watch(() => route.name, loadHistory)

async function loadHistory() {
  loading.value = true
  try {
    const result = await api.reviewHistory(isAll.value)
    items.value = result.items
  } catch (error) {
    showToast(error instanceof Error ? error.message : '审批历史加载失败')
  } finally {
    loading.value = false
  }
}

function timeText(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-'
}
</script>

<template>
  <main class="history-shell">
    <AdminHeader />
    <div class="history-workspace">
      <header class="history-heading">
        <div>
          <p class="eyebrow">Decision ledger</p>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>
        <div class="history-mark"><strong>{{ items.length }}</strong><span>条审批记录</span></div>
      </header>

      <section class="history-filters">
        <div class="filter-group">
          <button :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">全部结果</button>
          <button :class="{ active: statusFilter === 'approved' }" @click="statusFilter = 'approved'">已通过归档</button>
          <button :class="{ active: statusFilter === 'rejected' }" @click="statusFilter = 'rejected'">已驳回</button>
        </div>
        <select v-model="aiFilter" aria-label="AI 标签筛选">
          <option value="all">全部 AI 标签</option>
          <option value="anomaly">AI 异常</option>
          <option value="normal">AI 正常</option>
        </select>
      </section>

      <section class="history-table">
        <div class="history-head">
          <span>报备单 / 发票号码</span><span>提交方</span><span>审批结果</span><span>AI 判断</span><span>审批人</span><span>处理时间</span><span></span>
        </div>
        <div v-if="loading" class="empty">正在读取审批记录…</div>
        <div v-else-if="filteredItems.length === 0" class="empty">当前筛选下没有审批记录</div>
        <button
          v-for="item in filteredItems"
          v-else
          :key="item.id"
          class="history-row"
          @click="router.push({ name: 'review-detail', params: { id: item.id } })"
        >
          <span class="report"><small>#{{ item.id }}</small><strong>{{ item.fields?.invoiceNo || '-' }}</strong></span>
          <span class="owner"><strong>{{ item.owner.orgName }}</strong><small>{{ item.owner.username }}</small></span>
          <span><van-tag :type="item.status === '已驳回' ? 'danger' : 'success'">{{ item.status }}</van-tag></span>
          <span class="ai"><strong :class="{ danger: item.aiLabel === '异常' }">AI {{ item.aiLabel }}</strong><small>{{ item.anomalyReasons[0]?.message || '未命中异常规则' }}</small></span>
          <span class="reviewer">{{ item.reviewer?.username || '-' }}</span>
          <span class="time">{{ timeText(item.reviewedAt) }}</span>
          <span class="open">查看 <van-icon name="arrow" /></span>
        </button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.history-shell { min-height: 100vh; background: #f3f3f1; }
.history-workspace { max-width: 1280px; margin: 0 auto; padding: 42px 28px 70px; }
.history-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.history-heading h1 { margin: 0; font-family: Georgia, 'Songti SC', serif; font-size: 36px; font-weight: 500; letter-spacing: -.02em; }
.history-heading p:last-child { margin: 9px 0 0; color: #6b7280; font-size: 14px; }
.history-mark { display: grid; min-width: 132px; padding-left: 22px; border-left: 1px solid #cfd1d4; }
.history-mark strong { font-family: Georgia, serif; font-size: 32px; font-weight: 500; }.history-mark span { color: #6b7280; font-size: 11px; }
.history-filters { display: flex; justify-content: space-between; gap: 18px; margin-top: 34px; padding: 12px 0; border-block: 1px solid #d3d4d6; }
.filter-group { display: flex; gap: 4px; }.filter-group button { padding: 8px 12px; border: 0; background: transparent; color: #6b7280; font-size: 12px; cursor: pointer; }.filter-group button.active { background: #20262f; color: #fff; }
.history-filters select { padding: 7px 28px 7px 10px; border: 1px solid #d1d3d5; border-radius: 3px; background: #fff; color: #374151; font-size: 12px; }
.history-table { margin-top: 16px; overflow: hidden; border: 1px solid #d6d7d9; border-radius: 5px; background: #fff; }
.history-head, .history-row { display: grid; grid-template-columns: 1.35fr 1.2fr 1fr 1.3fr .7fr 1fr 54px; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; }
.history-head { background: #e9e9e7; color: #6b7280; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.history-row { border: 0; border-top: 1px solid #ebebed; background: #fff; text-align: left; cursor: pointer; }.history-row:hover { background: #faf9f7; box-shadow: inset 3px 0 #e2231a; }
.report, .owner, .ai { display: grid; gap: 5px; min-width: 0; }.report small, .owner small, .ai small, .time { overflow: hidden; color: #747980; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.report strong, .owner strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.ai strong { color: #157347; font-size: 11px; }.ai strong.danger { color: #b42318; }.reviewer { font-size: 12px; font-weight: 700; }.open { color: #e2231a; font-size: 11px; text-align: right; }.empty { padding: 58px 20px; color: #6b7280; text-align: center; }
@media (max-width: 950px) { .history-head { display: none; }.history-row { grid-template-columns: 1.3fr 1fr 1fr auto; }.owner, .ai, .time { display: none; } }
@media (max-width: 700px) { .history-workspace { padding: 30px 18px 86px; }.history-heading h1 { font-size: 30px; }.history-mark { display: none; }.history-row { grid-template-columns: 1fr auto; }.reviewer, .history-row > span:nth-child(3) { display: none; } }
</style>
