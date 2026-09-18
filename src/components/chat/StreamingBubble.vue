<script setup lang="ts">
/**
 * 聚合组件：B 风格 assistant 消息气泡的最终形态。
 *
 * 把 StageProgress / ChatMarkdown / ThoughtPanel / ToolCallsPanel /
 * ResourcesPanel / MessageActions 这六个子组件按 SSE 累积的 Message
 * 字段聚合到一个气泡里：
 *   - 流式进行中显示 StageProgress + 各折叠面板（默认展开）
 *   - 流式结束后保留 StageProgress（如有面板数据）+ 收起面板 + 显示操作栏
 *
 * 输入：完整的 Message + isStreaming 标记 + 可选的 streamingReasoning
 * （当前 stage === 'model_reasoning' 的实时打字机文本）。
 *
 * 注：实际字段名以 src/types/chat.ts 中 Message 定义为准。
 */
import { computed } from 'vue'
import type { Message } from '@/types/chat'
import { DEFAULT_STAGE_STATE } from '@/stores/chat'
import StageProgress from './StageProgress.vue'
import ThoughtPanel from './ThoughtPanel.vue'
import ToolCallsPanel from './ToolCallsPanel.vue'
import ResourcesPanel from './ResourcesPanel.vue'
import MessageActions from './MessageActions.vue'
import ChatMarkdown from './ChatMarkdown.vue'

const props = defineProps<{
  message: Message
  isStreaming: boolean
  /** 流式实时打字机文本（model_reasoning 阶段）；空串表示未进入该阶段或已结束 */
  streamingReasoning?: string
}>()

const hasAnyPanel = computed(() =>
  (props.message.thinkings?.length ?? 0) > 0
  || (props.message.toolCalls?.length ?? 0) > 0
  || (props.message.attachments?.length ?? 0) > 0,
)
</script>

<template>
  <div class="streaming-bubble">
    <StageProgress
      v-if="isStreaming || hasAnyPanel"
      :stage-state="message.stageState ?? DEFAULT_STAGE_STATE"
    />
    <ChatMarkdown :source="message.content" />
    <ThoughtPanel
      v-if="message.thinkings?.length"
      :thinkings="message.thinkings"
      :default-open="isStreaming"
      :streaming-text="streamingReasoning"
    />
    <ToolCallsPanel
      v-if="message.toolCalls?.length"
      :tool-calls="message.toolCalls"
      :default-open="isStreaming"
    />
    <ResourcesPanel
      v-if="message.attachments?.length"
      :resources="message.attachments"
      :default-open="isStreaming"
    />
    <MessageActions v-if="!isStreaming" :message="message" />
  </div>
</template>

<style scoped>
.streaming-bubble {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 18px 18px 18px 6px;
  padding: 16px 18px;
  color: #5a3a2a;
  font-size: 14px;
  line-height: 1.6;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(255, 138, 102, 0.08);
  max-width: 720px;
}
</style>