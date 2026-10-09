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
import MemoryExtractPanel from './MemoryExtractPanel.vue'
import ResourcesPanel from './ResourcesPanel.vue'
import MessageActions from './MessageActions.vue'
import ChatMarkdown from './ChatMarkdown.vue'

const props = defineProps<{
  message: Message
  isStreaming: boolean
  /** 流式实时打字机文本（model_reasoning 阶段）；空串表示未进入该阶段或已结束 */
  streamingReasoning?: string
}>()

/** 转发事件：把 MessageActions 的反馈（up/down/none）冒泡给父组件，
 *  父组件 ChatPage 会调 chatStore.rateMessage 走 API。
 *  复制 / TTS 暂不冒泡（页面已经各自有 handler）。 */
defineEmits<{
  (e: 'feedback', value: 'up' | 'down' | 'none'): void
}>()

/**
 * 任意阶段被触发过(running / done / skipped)即为 true。
 * 用于让 StageProgress 在流式结束后仍能保留阶段历史。
 */
const hasAnyStageActivity = computed(() =>
  Object.values(props.message.stageState ?? {}).some(s => s !== 'idle'),
)
</script>

<template>
  <div class="streaming-bubble">
    <StageProgress
      v-if="hasAnyStageActivity"
      :stage-state="message.stageState ?? DEFAULT_STAGE_STATE"
      :thinkings="message.thinkings"
      :tool-calls="message.toolCalls"
      :memory-recall="message.memoryRecall"
      :context="message.context"
      :streaming-reasoning="streamingReasoning"
      :answer="message.content"
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
    <MemoryExtractPanel
      v-if="message.memoryResult"
      :memory-result="message.memoryResult"
      :default-open="isStreaming"
    />
    <ResourcesPanel
      v-if="message.attachments?.length"
      :resources="message.attachments"
      :default-open="isStreaming"
    />
    <MessageActions v-if="!isStreaming" :message="message" @feedback="(v: 'up' | 'down' | 'none') => $emit('feedback', v)" />
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
  /*
   * 用百分比而不是固定 720px,让 AI 回复气泡随窗口大小等比例缩放,
   * 与 .message-bubble 的 90% max-width 保持一致。
   * 99% 而不是 100% 是为了避免 inline-flex 子项被父容器宽度挤掉换行。
   *
   * 不要用 width: fit-content —— LLM 输出的句间 \n 会被 ChatMarkdown
   * 渲染成 <br>,fit-content 会把气泡缩到「最长一行」的宽度,
   * 视觉上变成「窄而细、每句一行」,而不是用户记忆里「段落式」的回答。
   * 这里让气泡默认 width: auto 撑到 max-width,长内容就自然按容器宽度换行。
   */
  max-width: 99%;
}
</style>