<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { api } from '@/api/client'

const router = useRouter()
const selectedFile = ref<File | null>(null)
const uploading = ref(false)

function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
}

async function uploadInvoice() {
  if (!selectedFile.value) {
    showToast('请先选择发票文件')
    return
  }

  uploading.value = true
  try {
    const result = await api.uploadInvoice(selectedFile.value)
    showToast('发票已上传')
    router.replace({ name: 'report-detail', params: { id: result.report.id } })
  } catch (error) {
    showToast(error instanceof Error ? error.message : '上传失败')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <main class="mobile-shell new-report-page">
    <van-nav-bar title="新建发票报备" left-arrow fixed placeholder @click-left="router.back()" />

    <section class="page-pad">
      <p class="eyebrow">上传发票</p>
      <h1 class="page-title">选择真实发票文件</h1>
      <p class="page-subtitle">系统会把文件发送到后端保存，并创建一张待 L2 确认的报备单。</p>
    </section>

    <section class="upload-panel">
      <label class="upload-zone">
        <input accept="image/*,.pdf,application/pdf" type="file" @change="chooseFile" />
        <span>选择图片或 PDF</span>
        <strong>{{ selectedFile?.name || '尚未选择文件' }}</strong>
        <em v-if="selectedFile">{{ (selectedFile.size / 1024).toFixed(1) }} KB</em>
      </label>

      <van-button
        block
        type="primary"
        color="#e2231a"
        size="large"
        :loading="uploading"
        @click="uploadInvoice"
      >
        上传并创建报备单
      </van-button>
    </section>

    <section class="upload-notes">
      <h2>本阶段处理内容</h2>
      <p>真实上传、后端保存、OCR provider 识别、数据库落 OCR 原值，并初始化 L2 可确认字段。</p>
    </section>
  </main>
</template>

<style scoped>
.new-report-page {
  background: #f6f8fb;
}

.upload-panel {
  display: grid;
  gap: 18px;
  margin: 0 18px;
}

.upload-zone {
  display: grid;
  gap: 8px;
  min-height: 188px;
  place-items: center;
  padding: 24px 18px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  background: #fff;
  text-align: center;
}

.upload-zone input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.upload-zone span {
  color: #e2231a;
  font-size: 14px;
  font-weight: 700;
}

.upload-zone strong {
  max-width: 100%;
  color: #111827;
  font-size: 18px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.upload-zone em {
  color: #6b7280;
  font-size: 13px;
  font-style: normal;
}

.upload-notes {
  margin: 24px 18px;
  padding-top: 18px;
  border-top: 1px solid #e5e7eb;
}

.upload-notes h2 {
  margin: 0;
  color: #111827;
  font-size: 17px;
}

.upload-notes p {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.6;
}
</style>
