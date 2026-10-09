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
 *   - 子项（思考 / 人格 / L0 / L1 / L2 / …）默认全部折叠，点击子项名称展开内容，
 *     再次点击折叠；展开状态按胶囊隔离，切换胶囊互不串扰
 *   - 子项名称行 position: sticky：内容较长向下滚动时，当前子项名称始终钉在
 *     popover 顶部一行，便于随时点击折叠
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { ChatContextInfo, ChatToolCall, ChatMemoryRecall, ChatThinkingEvent, StageName, StageState } from '@/types/chat'

const props = defineProps<{
  stageState: Record<StageName, StageState>
  /** thinking 流（可能为空）；popover 内容来源 */
  thinkings?: ChatThinkingEvent[]
  /** 工具调用列表 */
  toolCalls?: ChatToolCall[]
  /** 回忆召回命中 */
  memoryRecall?: ChatMemoryRecall
  /** 上下文摘要 */
  context?: ChatContextInfo
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

// ---------- popover 子项展开状态 ----------
// 子项（思考 / 人格 / L0 核心记忆 / L1 近期摘要 / 召回命中 / …）默认全部折叠，
// 鼠标点击子项名称才展开该子项内容，再次点击折叠。
// 展开状态按「胶囊阶段 + 子项序号」隔离：切换胶囊互不串扰。
const expandedSections = ref<Set<string>>(new Set())

function sectionKey(idx: number): string | null {
  const stage = openStage.value
  return stage ? `${stage}#${idx}` : null
}

function toggleSection(idx: number) {
  const key = sectionKey(idx)
  if (!key) return
  const next = new Set(expandedSections.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedSections.value = next
}

function isSectionExpanded(idx: number): boolean {
  const key = sectionKey(idx)
  return key ? expandedSections.value.has(key) : false
}

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

interface PopoverBlock {
  /** 块标题（如"思考"、"人格"、"L0 核心记忆"） */
  label: string
  /** 块副标题（可选，如计数） */
  meta?: string
  /** 块种类 */
  kind: 'text' | 'list'
  /** kind='text' 时使用 */
  text?: string
  /** kind='list' 时使用 */
  items?: string[]
}

const popoverEntries = computed<PopoverBlock[]>(() => {
  const stage = openStage.value
  if (!stage) return []

  const out: PopoverBlock[] = []

  if (stage === 'intent') {
    const ts = thinkingsFor('intent')
    const ctx = props.context

    // 历史消息里 thinking + context 都不会从 DB 回传(后端 list_messages 协议只带 content)。
    // 这种"完全无数据"的情况下,把两个空 placeholder 合并成一条说明,避免用户看到
    // 「思考（无）」「上下文（无）」两条伪信息。
    if (ts.length === 0 && !ctx) {
      out.push({
        label: '上下文',
        kind: 'text',
        text: '（历史消息未保存此阶段的原始数据）',
      })
      return out
    }

    out.push({
      label: '思考',
      kind: 'text',
      text: ts.length ? ts.map((t) => t.text).join('\n\n') : '（该阶段未产生思考文本）',
    })

    if (ctx) {
      // 人格块
      out.push({
        label: '人格',
        meta: `长度 ${ctx.personaLen}`,
        kind: ctx.persona ? 'text' : 'list',
        text: ctx.persona || undefined,
        items: ctx.persona ? undefined : ['（本轮未注入人格原文）'],
      })
      // L0 块
      out.push({
        label: 'L0 核心记忆',
        meta: `${ctx.l0Count} 条`,
        kind: ctx.l0Items?.length ? 'list' : 'text',
        text: ctx.l0Items?.length ? undefined : '（本轮未注入 L0 详情，仅计数）',
        items: ctx.l0Items && ctx.l0Items.length ? ctx.l0Items : undefined,
      })
      // L1 / L2 拆分：优先用后端结构化 l2_items；老后端只下发混合 l1_items 时按 [L2] 前缀拆分
      const rawL1Items = ctx.l1Items ?? []
      const l2Source = ctx.l2Items
      const l2Items: string[] = Array.isArray(l2Source)
        ? l2Source
        : rawL1Items.filter((i) => i.startsWith('[L2]'))
      const l1Items: string[] = Array.isArray(l2Source)
        ? rawL1Items
        : rawL1Items.filter((i) => !i.startsWith('[L2]'))
      // L1 块
      out.push({
        label: 'L1 近期摘要',
        meta: `${l1Items.length || ctx.l1Count} 条`,
        kind: l1Items.length ? 'list' : 'text',
        text: l1Items.length ? undefined : '（本轮未注入 L1 详情，仅计数）',
        items: l1Items.length ? l1Items : undefined,
      })
      // L2 块（有内容才展示）
      if (l2Items.length) {
        out.push({
          label: 'L2 会话摘要',
          meta: `${l2Items.length} 条`,
          kind: 'list',
          items: l2Items,
        })
      }
    } else {
      out.push({ label: '上下文', kind: 'text', text: '（该阶段未产生 context 数据）' })
    }
    return out
  }

  if (stage === 'recall_search') {
    const ts = thinkingsFor('recall_search')
    out.push({
      label: '思考',
      kind: 'text',
      text: ts.length ? ts.map((t) => t.text).join('\n\n') : '（该阶段未产生思考文本）',
    })

    const mr = props.memoryRecall
    if (!mr) {
      out.push({ label: '召回命中', kind: 'text', text: '（无召回数据）' })
    } else if (mr.hits.length === 0) {
      out.push({ label: '召回命中', meta: `${mr.count} 条`, kind: 'text', text: '共 0 条命中（无详情）' })
    } else {
      out.push({
        label: '召回命中',
        meta: `${mr.count} 条`,
        kind: 'list',
        items: mr.hits.map(
          (h, i) =>
            `${i + 1}. ${h.topic}\n   ${h.summary}\n   相似度 ${h.similarity.toFixed(2)} · ${h.memoryId}`,
        ),
      })
    }
    return out
  }

  if (stage === 'tool_dispatch') {
    const tcs = props.toolCalls ?? []
    if (tcs.length === 0) {
      out.push({ label: '工具调用', kind: 'text', text: '（该阶段未调用工具）' })
    } else {
      out.push({
        label: '工具调用',
        meta: `${tcs.length} 次`,
        kind: 'list',
        items: tcs.map(
          (tc) => `${tc.ok ? '✓' : '✗'} ${tc.name}（第 ${tc.iter} 轮）\n   ${tc.summary}`,
        ),
      })
    }
    return out
  }

  if (stage === 'model_reasoning') {
    const txt = reasoningText()
    out.push({
      label: props.streamingReasoning ? '推理（实时）' : '推理',
      kind: 'text',
      text: txt || '（该阶段未产生推理文本）',
    })
    return out
  }

  if (stage === 'answer') {
    const txt = (props.answer ?? '').trim()
    out.push({ label: '回答', kind: 'text', text: txt || '（尚未生成回答）' })
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
          <button
            type="button"
            class="popover-section-head"
            :class="{ 'popover-section-head--collapsed': !isSectionExpanded(idx) }"
            :aria-expanded="isSectionExpanded(idx)"
            @click="toggleSection(idx)"
          >
            <span class="popover-section-caret" aria-hidden="true">{{ isSectionExpanded(idx) ? '▾' : '▸' }}</span>
            <span class="popover-section-label">{{ entry.label }}</span>
            <span v-if="entry.meta" class="popover-section-meta">{{ entry.meta }}</span>
          </button>
          <template v-if="isSectionExpanded(idx)">
            <pre v-if="entry.kind === 'text'" class="popover-section-text">{{ entry.text }}</pre>
            <ol v-else class="popover-section-list">
              <li v-for="(item, i) in entry.items" :key="i" class="popover-section-item">{{ item }}</li>
            </ol>
          </template>
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
.popover-section-head {
  /* sticky：内容较长时当前子项名称始终钉在 popover 顶部一行，方便点击折叠 */
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  margin-bottom: 6px;
  padding: 2px 4px 4px;
  border: none;
  border-bottom: 1px dashed rgba(255, 138, 102, 0.25);
  border-radius: 4px;
  /* 与 popover 同底色，滚动时遮住下方内容，避免透过 */
  background: rgba(255, 255, 255, 0.98);
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
  transition: background-color .15s;
}
.popover-section-head:hover {
  background: rgba(255, 138, 102, 0.08);
}
.popover-section-head:focus-visible {
  outline: 2px solid rgba(255, 138, 102, 0.5);
  outline-offset: 1px;
}
.popover-section-caret {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  color: #ff8a65;
  transition: transform .15s;
}
.popover-section-head--collapsed .popover-section-caret {
  transform: rotate(-90deg);
}
.popover-section-label {
  font-size: 11px;
  font-weight: 700;
  color: #ff8a65;
  letter-spacing: 0.5px;
}
.popover-section-meta {
  font-size: 10px;
  color: #c4a78a;
}
.popover-section-text {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #5a3a2a;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  background: rgba(255, 138, 102, 0.06);
  border-radius: 6px;
}
.popover-section-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.popover-section-item {
  position: relative;
  padding: 8px 10px 8px 26px;
  font-size: 12px;
  line-height: 1.6;
  color: #5a3a2a;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(255, 138, 102, 0.06);
  border-radius: 6px;
  border-left: 2px solid rgba(255, 138, 102, 0.4);
}
.popover-section-item::before {
  content: '·';
  position: absolute;
  left: 12px;
  top: 6px;
  color: #ff8a65;
  font-weight: 700;
}
</style>
