<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type ReportListItem } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const apiStatus = ref<'checking' | 'ok' | 'error'>('checking')
const apiMessage = ref('正在连接后端服务')
const reportItems = ref<ReportListItem[]>([])
const reportTotal = ref(0)
const reportsLoading = ref(true)

onMounted(async () => {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload = (await response.json()) as { status: string; database: string }
    apiStatus.value = payload.status === 'ok' && payload.database === 'ok' ? 'ok' : 'error'
    apiMessage.value = apiStatus.value === 'ok' ? '后端 API 与数据库连接正常' : '后端返回异常状态'
  } catch (error) {
    apiStatus.value = 'error'
    apiMessage.value = error instanceof Error ? error.message : '后端连接失败'
  }

  try {
    const reports = await api.reports()
    reportItems.value = reports.items
    reportTotal.value = reports.total
  } finally {
    reportsLoading.value = false
  }
})

function logout() {
  auth.logout()
  router.replace({ name: 'login' })
}

function goNewReport() {
  router.push({ name: 'new-report' })
}

function openReport(id: string) {
  router.push({ name: 'report-detail', params: { id } })
}
</script>

<template>
  <main class="mobile-shell home-page">
    <van-nav-bar title="我的发票报备" fixed placeholder>
      <template #right>
        <button class="logout-btn" type="button" @click="logout">退出</button>
      </template>
    </van-nav-bar>

    <section class="page-pad">
      <p class="eyebrow">L2 工作台</p>
      <h1 class="page-title">{{ auth.currentUser?.orgName }}</h1>
      <p class="page-subtitle">{{ auth.currentUser?.username }} · {{ auth.currentUser?.region }}</p>
    </section>

    <section class="system-strip" :class="apiStatus">
      <span class="status-dot" />
      <div>
        <strong>系统连接</strong>
        <p>{{ apiMessage }}</p>
      </div>
    </section>

    <section class="summary-band">
      <div>
        <strong>{{ reportTotal }}</strong>
        <span>我的报备</span>
      </div>
      <div>
        <strong>{{ reportItems.filter((item) => item.status === '待 L2 确认').length }}</strong>
        <span>待确认</span>
      </div>
      <div>
        <strong>{{ reportItems.filter((item) => item.aiLabel === '异常').length }}</strong>
        <span>异常</span>
      </div>
    </section>

    <section v-if="reportsLoading" class="empty-state">
      <h2>正在读取报备单</h2>
      <p>系统正在从后端加载当前 L2 用户自己的报备数据。</p>
    </section>

    <section v-else-if="reportItems.length > 0" class="report-list">
      <article v-for="report in reportItems" :key="report.id" class="report-row">
        <button type="button" @click="openReport(report.id)">
          <div>
          <strong>{{ report.fields?.invoiceNo || '未填写发票号' }}</strong>
            <span>{{ report.invoiceFile?.originalName || report.fields?.buyerName || '发票文件已保存' }}</span>
          </div>
          <em>{{ report.status }}</em>
        </button>
      </article>
    </section>

    <section v-else class="empty-state">
      <h2>还没有报备单</h2>
      <p>当前账号暂无报备数据。下一步会接入真实发票上传入口，报备单会从后端创建并持久化。</p>
      <van-button block type="primary" color="#e2231a" @click="goNewReport">新建发票报备</van-button>
    </section>

    <div v-if="!reportsLoading && reportItems.length > 0" class="fixed-action">
      <van-button block type="primary" color="#e2231a" @click="goNewReport">新建发票报备</van-button>
    </div>
  </main>
</template>

<style scoped>
.home-page {
  background: #f6f8fb;
}

.logout-btn {
  border: 0;
  color: #6b7280;
  background: transparent;
  font-size: 13px;
}

.summary-band {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  margin: 0 18px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #e5e7eb;
}

.system-strip {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 0 18px 18px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.system-strip.ok {
  border-color: #bbf7d0;
}

.system-strip.error {
  border-color: #fecaca;
}

.status-dot {
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: 999px;
  background: #f59e0b;
}

.system-strip.ok .status-dot {
  background: #16a34a;
}

.system-strip.error .status-dot {
  background: #dc2626;
}

.system-strip strong {
  display: block;
  font-size: 14px;
  line-height: 1.2;
}

.system-strip p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.4;
}

.summary-band div {
  display: grid;
  gap: 4px;
  padding: 14px 10px;
  background: #fff;
  text-align: center;
}

.summary-band strong {
  color: #111827;
  font-size: 24px;
  line-height: 1;
}

.summary-band span {
  color: #6b7280;
  font-size: 12px;
}

.empty-state {
  margin: 18px;
  padding: 26px 0 0;
  border-top: 1px solid #e5e7eb;
}

.empty-state h2 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

.empty-state p {
  margin: 8px 0 18px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.6;
}

.report-list {
  display: grid;
  gap: 10px;
  margin: 18px;
}

.report-row {
  padding: 0;
  border: 0;
  background: transparent;
}

.report-row button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  text-align: left;
}

.report-row strong,
.report-row span {
  display: block;
}

.report-row strong {
  color: #111827;
  font-size: 15px;
}

.report-row span {
  margin-top: 4px;
  color: #6b7280;
  font-size: 13px;
}

.report-row em {
  flex: 0 0 auto;
  color: #6b7280;
  font-size: 12px;
  font-style: normal;
}

.fixed-action {
  position: sticky;
  bottom: 0;
  padding: 12px 18px 18px;
  border-top: 1px solid #e5e7eb;
  background: rgba(246, 248, 251, 0.94);
  backdrop-filter: blur(10px);
}
</style>
