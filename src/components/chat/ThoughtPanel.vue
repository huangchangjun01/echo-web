<script setup lang="ts">
/**
 * 思考过程折叠子面板（B 风格 · 折叠态：流式中展开、结束后折叠）。
 *
 * 数据来源：
 *   - 优先使用流式实时打字机输出（streamingText，character-by-character）
 *   - 回退到 thinkings[] 中 stage === 'model_reasoning' 的累积文本
 *
 * 注意：
 *   - ChatThinkingEvent 类型当前仅含 { stage, text }，无 ts_ms 字段
 *   - 展示用"已完成"标记流式结束态；流式进行中显示"实时"
 */
import { computed, ref, watch } from 'vue'
import type { ChatThinkingEvent } from '@/types/chat'

const props = defineProps<{
  thinkings: ChatThinkingEvent[]
  defaultOpen: boolean
  /** 流式实时打字机文本（流式结束后为空串） */
  streamingText?: string
}>()

const isOpen = ref<boolean>(props.defaultOpen)
watch(
  () => props.defaultOpen,
  (v) => {
    isOpen.value = v
  },
)

const reasoningText = computed(
  () =>
    props.streamingText
    || props.thinkings
      .filter((t) => t.stage === 'model_reasoning')
      .map((t) => t.text)
      .join('\n\n'),
)

const hasReasoning = computed(() => reasoningText.value.trim().length > 0)

const durationLabel = computed(() => (props.streamingText ? '实时' : '已完成'))
</script>

<template>
  <details v-if="hasReasoning" class="chat-subpanel thought-panel" :open="isOpen">
    <summary @click.prevent="isOpen = !isOpen">
      <span class="subpanel-icon">💭</span>
      <span>思考过程</span>
      <span class="subpanel-meta">· {{ durationLabel }}</span>
    </summary>
    <div class="subpanel-body">{{ reasoningText }}</div>
  </details>
</template>

<style scoped>
.thought-panel .subpanel-body {
  font-style: italic;
  color: #a06a4a;
  line-height: 1.6;
}
</style>

<style>
@import './subpanel-shared.css';
</style>
