<script setup lang="ts">
/**
 * 工具调用折叠子面板（B 风格 · 蓝绿色系 · icon 🛠️）。
 *
 * 数据来源：ChatToolCall[]（event=tool 累积），
 * 字段：{ name, iter, ok, summary }。
 *
 * 渲染：每条一行，状态图标 + 工具名 + 摘要。
 */
import { ref, watch } from 'vue'
import type { ChatToolCall } from '@/types/chat'

const props = defineProps<{
  toolCalls: ChatToolCall[]
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
  <details v-if="toolCalls.length" class="chat-subpanel tool-panel" :open="isOpen">
    <summary @click.prevent="isOpen = !isOpen">
      <span class="subpanel-icon" style="color: #10b981;">🛠️</span>
      <span>调用工具</span>
      <span class="subpanel-meta">· {{ toolCalls.length }} 次</span>
    </summary>
    <div class="subpanel-body">
      <div
        v-for="tc in toolCalls"
        :key="`${tc.name}-${tc.iter}`"
        class="tool-item"
      >
        <span :class="['tool-status', tc.ok ? 'ok' : 'fail']">{{ tc.ok ? '✓' : '✗' }}</span>
        <strong>{{ tc.name }}</strong>
        <span class="tool-summary">{{ tc.summary }}</span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.tool-panel .subpanel-body {
  color: #065f46;
}
.tool-item {
  margin-bottom: 6px;
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.tool-status.ok {
  color: #10b981;
}
.tool-status.fail {
  color: #ef4444;
}
.tool-summary {
  color: #a06a4a;
  font-size: 11px;
}
</style>

<style>
@import './subpanel-shared.css';
</style>
