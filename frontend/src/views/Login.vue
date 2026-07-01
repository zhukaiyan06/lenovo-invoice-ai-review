<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const username = ref('')
const password = ref('')
const submitting = ref(false)

async function submitLogin() {
  submitting.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    router.replace({ name: auth.isL2 ? 'home' : 'review-queue' })
  } catch (error) {
    showToast(error instanceof Error ? error.message : '登录失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-hero">
      <div class="hero-number">01 / REVIEW ACCESS</div>
      <p class="eyebrow">Lenovo Channel Intelligence</p>
      <h1>发票报备<br><em>AI 辅助审核</em></h1>
      <p>通过统一账号进入报备工作台。AI 负责提示风险，人工负责最终决策。</p>
      <div class="hero-rule"><span></span><small>SECURE REVIEW WORKSPACE</small></div>
    </section>

    <section class="login-panel">
      <div class="panel-heading">
        <div><p>ACCOUNT SIGN-IN</p><h2>账号登录</h2></div>
        <span>请输入账号密码</span>
      </div>
      <van-form @submit="submitLogin">
        <van-cell-group inset>
          <van-field
            v-model="username"
            name="username"
            label="账号"
            placeholder="请输入账号"
            autocomplete="username"
          />
          <van-field
            v-model="password"
            type="password"
            name="password"
            label="密码"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </van-cell-group>

        <div class="login-actions">
          <van-button
            block
            type="primary"
            color="#e2231a"
            size="large"
            native-type="submit"
            :loading="submitting"
          >
            登录工作台
          </van-button>
        </div>
      </van-form>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; grid-template-columns: minmax(340px, .82fr) minmax(520px, 1.18fr); min-height: 100vh; background: #f3f3f1; }
.login-hero { position: relative; display: flex; flex-direction: column; justify-content: center; overflow: hidden; padding: 64px clamp(36px, 6vw, 88px); background: #1e242c; color: #fff; }
.login-hero::after { position: absolute; right: -120px; bottom: -150px; width: 420px; height: 420px; border: 1px solid rgba(255,255,255,.12); border-radius: 50%; box-shadow: 0 0 0 55px rgba(255,255,255,.025), 0 0 0 110px rgba(255,255,255,.018); content: ''; }
.hero-number { position: absolute; top: 36px; left: clamp(36px, 6vw, 88px); color: #8d949c; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
.login-hero .eyebrow { color: #ff5c54; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
.login-hero h1 { margin: 12px 0 0; font-family: Georgia, 'Songti SC', serif; font-size: clamp(42px, 5vw, 68px); font-weight: 400; line-height: 1.08; letter-spacing: -.04em; }.login-hero h1 em { color: #ff5c54; font-style: normal; }
.login-hero > p { max-width: 470px; margin: 24px 0 0; color: #b6bbc1; font-size: 14px; line-height: 1.8; }.hero-rule { display: flex; align-items: center; gap: 13px; margin-top: 44px; }.hero-rule span { width: 52px; height: 2px; background: #e2231a; }.hero-rule small { color: #7f8790; font-size: 9px; letter-spacing: .12em; }
.login-panel { align-self: center; width: min(680px, 100%); margin: 0 auto; padding: 48px clamp(28px, 6vw, 76px); }.panel-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }.panel-heading p { margin: 0; color: #e2231a; font-size: 9px; font-weight: 900; letter-spacing: .14em; }.panel-heading h2 { margin: 5px 0 0; font-family: Georgia, 'Songti SC', serif; font-size: 25px; font-weight: 500; }.panel-heading > span { color: #777c83; font-size: 11px; }
.login-actions { margin: 18px 16px 0; }
@media (max-width: 800px) { .login-page { grid-template-columns: 1fr; }.login-hero { min-height: 300px; padding: 76px 28px 40px; }.hero-number { left: 28px; }.login-hero h1 { font-size: 42px; }.login-panel { padding: 34px 20px 44px; } }
</style>
