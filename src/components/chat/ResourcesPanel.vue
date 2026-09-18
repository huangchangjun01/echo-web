<script setup lang="ts">
/**
 * 引用资源折叠子面板（B 风格 · 紫色系 · icon 📎）。
 *
 * 数据来源：ChatAttachment[]（event=resource 累积）。
 * ChatAttachment 字段（camelCase）：
 *   { id, name, displayName, url, fileId?, modality, mimeType?,
 *     chunkIndex, totalChunks, sizeBytes?, similarity?, source?, iter? }
 *
 * 渲染：每条一行，模态图标 + 文件名 + 可选相似度。
 */
import { ref, watch } from 'vue'
import type { ChatAttachment } from '@/types/chat'

const props = defineProps<{
  resources: ChatAttachment[]
  defaultOpen: boolean
}>()

const isOpen = ref<boolean>(props.defaultOpen)
watch(
  () => props.defaultOpen,
  (v) => {
    isOpen.value = v
  },
)

/** 模态图标（image/audio/video/file 四种） */
function iconFor(modality: string): string {
  if (modality === 'image') return '🖼️'
  if (modality === 'audio') return '🎵'
  if (modality === 'video') return '🎬'
  if (modality === 'file') return '📎'
  return '📎'
}

/** 资源列表去重 key：缺 id 时回退到 fileId+chunkIndex */
function keyOf(r: ChatAttachment): string {
  return r.id || `${r.fileId ?? ''}#${r.chunkIndex ?? 0}`
}
</script>

<template>
  <details v-if="resources.length" class="chat-subpanel resource-panel" :open="isOpen">
    <summary @click.prevent="isOpen = !isOpen">
      <span class="subpanel-icon" style="color: #8b5cf6;">📎</span>
      <span>引用资源</span>
      <span class="subpanel-meta">· {{ resources.length }} 个</span>
    </summary>
    <div class="subpanel-body">
      <div v-for="r in resources" :key="keyOf(r)" class="resource-item">
        <span class="resource-icon">{{ iconFor(r.modality) }}</span>
        <strong>{{ r.displayName || r.name || r.fileId || '未命名' }}</strong>
        <span v-if="typeof r.similarity === 'number'" class="resource-meta">
          相似度 {{ r.similarity.toFixed(2) }}
        </span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.resource-panel .subpanel-body {
  color: #5b21b6;
}
.resource-item {
  margin-bottom: 4px;
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.resource-icon {
  font-size: 13px;
  line-height: 1;
}
.resource-meta {
  color: #a06a4a;
  font-size: 11px;
}
</style>

<style>
@import './subpanel-shared.css';
</style>
