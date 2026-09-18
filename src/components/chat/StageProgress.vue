<script setup lang="ts">
/**
 * 5 阶段进度条（B 风格 · 胶囊形 · 单行铺开）。
 *
 * 行为：
 *   - 任意阶段被触发(running/done/skipped)即渲染
 *   - 点击单个胶囊切换 popover，popover 显示该阶段相关的"全部原始数据"：
 *       intent         → 该阶段 thinking + context 摘要
 *       recall_search  → 该阶段 thinking + memoryRecall.hits
 *       tool_dispatch  → toolCalls 列表
 *       model_reasoning→ 该阶段 thinking(包含 cascade) + 累积 reasoning
 *       answer         → message.content 预览
 *   - 点击 popover 外部或再次点击同一胶囊 → 关闭
 *   - 点击其他胶囊 → 切换到那个胶囊的 popover
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { ChatThinkingEvent, StageName, StageState } from '@/types/chat'

const props = defineProps<{
  stageState: Record<StageName, StageState>
  /** thinking 流（可能为空）；popover 内容来源 */
  thinkings?: ChatThinkingEvent[]
  /** 工具调用列表 */
  toolCalls?: { name: string; iter: number; ok: boolean; summary: string }[]
  /** 回忆召回命中 */
  memoryRecall?: { count: number; hits: { memoryId: string; topic: string; summary: string; similarity: number }[] }
  /** 上下文摘要 */
  context?: { personaLen: number; l0Count: number; l1Count: number; persona?: string; l0Items?: string[]; l1Items?: string[] }
  /** 流式实时打字机文本（model_reasoning 阶段实时输出） */
  streamingReasoning?: string
  /** 答案正文 */
  answer?: string
}>()

const STAGES: { name: StageName; label: string }[] = [
  { name: 'intent', label: '意图' },
  { name: 'recall_search', label: '回忆' },
  { name: 'tool_dispatch', label: '工具' },
  { name: 'model_reasoning', label: '推理' },
  { name: 'answer', label: '回答' },
]

function iconFor(state: StageState): string {
  if (state === 'done') return '✓'
  if (state === 'running') return '●'
  if (state === 'skipped') return '–'
  return ''
}

// ---------- popover 状态 ----------
const openStage = ref<StageName | null>(null)
const rootRef = ref<HTMLElement | null>(null)

function toggle(stage: StageName) {
  openStage.value = openStage.value === stage ? null : stage
}

function onDocClick(e: MouseEvent) {
  if (!openStage.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    openStage.value = null
  }
}

document.addEventListener('click', onDocClick)
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

// ---------- popover 内容 ----------
/** 按阶段筛选 thinking（model_reasoning 包含 cascade） */
function thinkingsFor(stage: StageName): ChatThinkingEvent[] {
  const all = props.thinkings ?? []
  if (stage === 'model_reasoning') {
    return all.filter((t) => t.stage === 'model_reasoning' || t.stage === 'cascade')
  }
  return all.filter((t) => t.stage === stage)
}

function reasoningText(): string {
  return (
    props.streamingReasoning
    ?? thinkingsFor('model_reasoning').map((t) => t.text).join('\n\n')
  ).trim()
}

interface PopoverEntry {
  label: string
  text: string
}

const popoverEntries = computed<PopoverEntry[]>(() => {
  const stage = openStage.value
  if (!stage) return []

  const out: PopoverEntry[] = []

  if (stage === 'intent') {
    const ts = thinkingsFor('intent')
    if (ts.length) {
      out.push({ label: '思考', text: ts.map((t) => t.text).join('\n\n') })
    } else {
      out.push({ label: '思考', text: '（该阶段未产生思考文本）' })
    }
    if (props.context) {
      const ctx = props.context
      const lines: string[] = []
      lines.push(`人格长度：${ctx.personaLen}`)
      lines.push(`L0 核心记忆：${ctx.l0Count}`)
      lines.push(`L1 近期摘要：${ctx.l1Count}`)
      if (ctx.persona) lines.push(`\n— 人格片段 —\n${ctx.persona}`)
      if (ctx.l0Items?.length) lines.push(`\n— L0 记忆条目 —\n${ctx.l0Items.join('\n')}`)
      if (ctx.l1Items?.length) lines.push(`\n— L1 摘要条目 —\n${ctx.l1Items.join('\n')}`)
      out.push({ label: '上下文', text: lines.join('\n') })
    }
    return out
  }

  if (stage === 'recall_search') {
    const ts = thinkingsFor('recall_search')
    if (ts.length) {
      out.push({ label: '思考', text: ts.map((t) => t.text).join('\n\n') })
    } else {
      out.push({ label: '思考', text: '（该阶段未产生思考文本）' })
    }
    if (props.memoryRecall) {
      const mr = props.memoryRecall
      if (mr.hits.length === 0) {
        out.push({ label: '召回命中', text: `共 ${mr.count} 条命中（无详情）` })
      } else {
        const hits = mr.hits
          .map(
            (h, i) =>
              `${i + 1}. ${h.topic}\n   ${h.summary}\n   相似度 ${h.similarity.toFixed(2)} · ${h.memoryId}`,
          )
          .join('\n\n')
        out.push({ label: `召回命中 (${mr.count})`, text: hits })
      }
    } else {
      out.push({ label: '召回命中', text: '（无召回数据）' })
    }
    return out
  }

  if (stage === 'tool_dispatch') {
    const tcs = props.toolCalls ?? []
    if (tcs.length === 0) {
      out.push({ label: '工具调用', text: '（该阶段未调用工具）' })
    } else {
      const lines = tcs
        .map(
          (tc) =>
            `${tc.ok ? '✓' : '✗'} ${tc.name}（第 ${tc.iter} 轮）\n   ${tc.summary}`,
        )
        .join('\n\n')
      out.push({ label: `工具调用 (${tcs.length})`, text: lines })
    }
    return out
  }

  if (stage === 'model_reasoning') {
    const txt = reasoningText()
    out.push({
      label: props.streamingReasoning ? '推理（实时）' : '推理',
      text: txt || '（该阶段未产生推理文本）',
    })
    return out
  }

  if (stage === 'answer') {
    const txt = (props.answer ?? '').trim()
    out.push({
      label: '回答',
      text: txt || '（尚未生成回答）',
    })
    return out
  }

  return out
})
</script>

<template>
  <div ref="rootRef" class="stage-progress">
    <div class="stage-chip-row">
      <button
        v-for="stage in STAGES"
        :key="stage.name"
        type="button"
        :class="[
          'stage-chip',
          `stage-${props.stageState[stage.name]}`,
          { 'stage-chip-active': openStage === stage.name },
        ]"
        @click.stop="toggle(stage.name)"
      >
        <span class="stage-icon">{{ iconFor(props.stageState[stage.name]) }}</span>
        <span class="stage-label">{{ stage.label }}</span>
      </button>
    </div>

    <div v-if="openStage" class="stage-popover" @click.stop>
      <div class="stage-popover-arrow" />
      <div class="stage-popover-inner">
        <div v-if="popoverEntries.length === 0" class="popover-empty">该阶段无数据</div>
        <div v-for="(entry, idx) in popoverEntries" :key="idx" class="popover-section">
          <div class="popover-section-label">{{ entry.label }}</div>
          <pre class="popover-section-text">{{ entry.text }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-progress {
  position: relative;
  margin-bottom: 12px;
  width: 100%;
}
.stage-chip-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  width: 100%;
}
.stage-chip {
  flex: 1 1 0;
  min-width: 0;
  font-size: clamp(10px, 2.2vw, 12px);
  padding: 5px 6px;
  border: none;
  border-radius: 999px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  font-family: inherit;
  transition: background-color .3s, color .3s, box-shadow .3s, transform .15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.stage-chip:hover {
  transform: translateY(-1px);
}
.stage-chip.stage-chip-active {
  box-shadow: 0 0 0 2px rgba(255, 138, 102, 0.55);
}
.stage-icon {
  flex-shrink: 0;
  font-size: 1em;
  line-height: 1;
}
.stage-label {
  white-space: nowrap;
}
.stage-chip.stage-idle { background: rgba(255, 138, 102, 0.15); color: #a05a3a; }
.stage-chip.stage-running {
  background: #ff8a65; color: #fff; font-weight: 600;
  box-shadow: 0 0 0 4px rgba(255,138,102,0.25);
  animation: stagePulse 1.4s infinite;
}
.stage-chip.stage-done { background: #4ade80; color: #fff; }
.stage-chip.stage-skipped { background: rgba(0,0,0,0.06); color: #c4a78a; }
.stage-chip.stage-idle .stage-icon { display: none; }
@keyframes stagePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,138,102,0.4); }
  50% { box-shadow: 0 0 0 6px rgba(255,138,102,0.15); }
}

/* popover */
.stage-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(255, 138, 102, 0.25);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 6px 24px rgba(255, 138, 102, 0.18);
  color: #5a3a2a;
  max-height: 320px;
  overflow-y: auto;
}
.stage-popover-arrow {
  position: absolute;
  top: -6px;
  left: 24px;
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.98);
  border-left: 1px solid rgba(255, 138, 102, 0.25);
  border-top: 1px solid rgba(255, 138, 102, 0.25);
  transform: rotate(45deg);
}
.stage-popover-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.popover-empty {
  font-size: 12px;
  color: #a06a4a;
  font-style: italic;
}
.popover-section-label {
  font-size: 11px;
  font-weight: 600;
  color: #ff8a65;
  margin-bottom: 4px;
}
.popover-section-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #5a3a2a;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}
</style>
