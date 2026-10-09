<script setup lang="ts">
/**
 * 长期记忆抽取结果折叠面板（B 风格 · 蓝紫色系 · icon 🧠）。
 *
 * 数据来源：Message.memoryResult（event=memory_extracted 累积，类型 ChatMemoryResult）。
 * 字段：{ ok: boolean, error?: string }
 *
 * 渲染：单行状态，失败时附加 error 描述。
 */
import { ref, watch } from 'vue'
import type { ChatMemoryResult } from '@/types/chat'

const props = defineProps<{
  memoryResult: ChatMemoryResult
  defaultOpen: boolean
}>()

const isOpen = ref<boolean>(props.defaultOpen)
watch(
  () => props.defaultOpen,
  (v) => {
    isOpen.value = v
  },
)
</script>

<template>
  <details v-if="memoryResult" class="chat-subpanel memory-extract-panel" :open="isOpen">
    <summary @click.prevent="isOpen = !isOpen">
      <span class="subpanel-icon" style="color: #8b5cf6;">🧠</span>
      <span>长期记忆抽取</span>
      <span class="subpanel-meta">· {{ memoryResult.ok ? '成功' : '失败' }}</span>
    </summary>
    <div class="subpanel-body">
      <div class="memory-extract-item">
        <span :class="['memory-extract-status', memoryResult.ok ? 'ok' : 'fail']">
          {{ memoryResult.ok ? '✓' : '✗' }}
        </span>
        <span v-if="memoryResult.ok">已写入长期记忆（具体明细可在「记忆管理」中查看）</span>
        <span v-else class="memory-extract-error">{{ memoryResult.error || '未知错误' }}</span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.memory-extract-panel .subpanel-body {
  color: #6d28d9;
}
.memory-extract-item {
  margin-bottom: 6px;
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.memory-extract-status.ok {
  color: #8b5cf6;
}
.memory-extract-status.fail {
  color: #ef4444;
}
.memory-extract-error {
  color: #b91c1c;
  font-size: 12px;
  word-break: break-all;
}
</style>

<style>
@import './subpanel-shared.css';
</style>
