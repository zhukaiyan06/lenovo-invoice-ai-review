import { createRouter, createWebHistory } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import Login from '@/views/Login.vue'
import Home from '@/views/Home.vue'
import NewReport from '@/views/NewReport.vue'
import ReportDetail from '@/views/ReportDetail.vue'
import AuditorQueue from '@/views/AuditorQueue.vue'
import AuditorReportDetail from '@/views/AuditorReportDetail.vue'
import ReviewHistory from '@/views/ReviewHistory.vue'
import ArchivedDashboard from '@/views/ArchivedDashboard.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home'
    },
    {
      path: '/login',
      name: 'login',
      component: Login
    },
    {
      path: '/home',
      name: 'home',
      component: Home,
      meta: {
        requiresAuth: true,
        requiresL2: true
      }
    },
    {
      path: '/reports/new',
      name: 'new-report',
      component: NewReport,
      meta: {
        requiresAuth: true,
        requiresL2: true
      }
    },
    {
      path: '/reports/:id',
      name: 'report-detail',
      component: ReportDetail,
      meta: {
        requiresAuth: true,
        requiresL2: true
      }
    },
    {
      path: '/review',
      name: 'review-queue',
      component: AuditorQueue,
      meta: {
        requiresAuth: true,
        requiresAuditor: true
      }
    },
    {
      path: '/review/reports/:id',
      name: 'review-detail',
      component: AuditorReportDetail,
      meta: {
        requiresAuth: true,
        requiresAuditor: true
      }
    },
    {
      path: '/review/history',
      name: 'review-history',
      component: ReviewHistory,
      meta: {
        requiresAuth: true,
        requiresAuditor: true
      }
    },
    {
      path: '/review/history/all',
      name: 'review-history-all',
      component: ReviewHistory,
      meta: {
        requiresAuth: true,
        requiresAuditor: true,
        requiresSupervisor: true
      }
    },
    {
      path: '/review/archived',
      name: 'archived-dashboard',
      component: ArchivedDashboard,
      meta: {
        requiresAuth: true,
        requiresAuditor: true
      }
    }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restoreSession()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login' }
  }

  if (to.meta.requiresL2 && auth.currentUser?.role !== 'L2') {
    showToast('当前页面仅对 L2 用户开放')
    return { name: 'review-queue' }
  }

  if (to.meta.requiresAuditor && !auth.isAuditor) {
    showToast('当前账号无审核权限')
    return { name: 'home' }
  }

  if (to.meta.requiresSupervisor && !auth.isSupervisor) {
    showToast('仅后台主管可查看全员审批历史')
    return { name: 'review-history' }
  }

  if (to.name === 'login' && auth.isLoggedIn) {
    return auth.isL2 ? { name: 'home' } : { name: 'review-queue' }
  }

  return true
})
