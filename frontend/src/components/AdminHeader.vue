<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const resetting = ref(false)

async function resetDemo() {
  try {
    await showConfirmDialog({
      title: '重置演示数据',
      message: '重置后所有演示数据将恢复到初始状态，确定要重置吗？',
      confirmButtonColor: '#e2231a'
    })
  } catch {
    return
  }

  resetting.value = true
  try {
    await api.resetDemo()
    showToast('演示数据已重置，即将返回登录页')
    setTimeout(() => {
      auth.logout()
      router.replace({ name: 'login' })
    }, 1200)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '重置失败')
  } finally {
    resetting.value = false
  }
}

function switchAccount() {
  auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <header class="admin-header">
    <div class="admin-header-inner">
      <button class="admin-brand" type="button" @click="router.push({ name: 'review-queue' })">
        <span>Lenovo Channel</span>
        <strong>AI 发票审核台</strong>
      </button>

      <nav aria-label="后台审核导航">
        <button :class="{ active: route.name === 'review-queue' }" @click="router.push({ name: 'review-queue' })">待审队列</button>
        <button :class="{ active: route.name === 'review-history' }" @click="router.push({ name: 'review-history' })">我的处理历史</button>
        <button
          v-if="auth.isSupervisor"
          :class="{ active: route.name === 'review-history-all' }"
          @click="router.push({ name: 'review-history-all' })"
        >全员审批历史</button>
        <button :class="{ active: route.name === 'archived-dashboard' }" @click="router.push({ name: 'archived-dashboard' })">归档数据看板</button>
      </nav>

      <div class="admin-account">
        <div>
          <strong>{{ auth.currentUser?.username }}</strong>
          <span>{{ auth.isSupervisor ? '后台主管' : '审核员' }}</span>
        </div>
        <button class="switch-button" type="button" :disabled="resetting" @click="resetDemo">重置演示数据</button>
        <button class="switch-button" type="button" @click="switchAccount">切换账号</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.admin-header { position: sticky; top: 0; z-index: 8; border-bottom: 1px solid #d9dadd; background: rgba(255, 255, 255, .97); backdrop-filter: blur(14px); }
.admin-header-inner { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 34px; max-width: 1280px; height: 68px; margin: 0 auto; padding: 0 28px; }
.admin-brand { display: grid; gap: 2px; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.admin-brand span { color: #e2231a; font-size: 10px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
.admin-brand strong { color: #111827; font-size: 15px; }
nav { display: flex; align-self: stretch; gap: 4px; }
nav button { position: relative; padding: 0 13px; border: 0; background: transparent; color: #6b7280; font-size: 13px; cursor: pointer; }
nav button::after { position: absolute; right: 13px; bottom: -1px; left: 13px; height: 2px; background: #e2231a; content: ''; opacity: 0; transform: scaleX(.35); transition: 160ms ease; }
nav button:hover, nav button.active { color: #111827; }
nav button.active::after { opacity: 1; transform: scaleX(1); }
.admin-account { display: flex; align-items: center; gap: 14px; }
.admin-account > div { display: grid; text-align: right; }
.admin-account strong { font-size: 12px; }
.admin-account span { color: #6b7280; font-size: 11px; }
.switch-button { padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; color: #374151; font-size: 12px; cursor: pointer; }
@media (max-width: 800px) {
  .admin-header-inner { grid-template-columns: 1fr auto; gap: 16px; padding-inline: 18px; }
  nav { position: fixed; right: 0; bottom: 0; left: 0; z-index: 10; justify-content: center; height: 52px; border-top: 1px solid #d9dadd; background: #fff; }
  .admin-account > div { display: none; }
}
</style>
