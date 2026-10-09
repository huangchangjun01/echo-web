<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{ source: string }>()
const rendered = ref('')

/**
 * 并段阈值：不超过该长度、且不是结构块的段落，视为「一句话」。
 * 模型（尤其闲聊型人格）习惯在每个短句后空一行，视觉上变成"一句话一行"、
 * 气泡又窄又高；前端渲染时把相邻的短句块折回同一段落，恢复"一段话"观感。
 */
const MERGE_MAX_LEN = 50
/** 结构块前缀（标题 / 列表 / 引用 / 表格 / 代码块占位符）—— 保持各自成行，不参与并段 */
const STRUCTURAL_RE = /^(#{1,6}\s|[-*+]\s|\d+[.、)]\s?|>\s?|\||\u0000)/

/** 把 ``` 代码块整体替换成单行占位符，避免并段逻辑拆散/合并代码行（后面按序还原） */
function maskFences(text: string): { masked: string; fences: string[] } {
  const fences: string[] = []
  const masked = text.replace(/```[\s\S]*?```/g, (m) => {
    fences.push(m)
    return `\u0000F${fences.length - 1}\u0000`
  })
  return { masked, fences }
}

function isShortSentence(block: string): boolean {
  const t = block.trim()
  return (
    t.length > 0 &&
    t.length <= MERGE_MAX_LEN &&
    !t.includes('\n') &&
    !STRUCTURAL_RE.test(t)
  )
}

/**
 * 把「一句一行」折回自然段落：空行分隔的相邻短句块合并为同一段（空行 → 空格）；
 * 标题 / 列表 / 表格 / 代码块等结构块、以及长段落保持原样（仍用空行分隔）。
 *
 * 注意:可并段性按「每一个原始块」判断（链式短句要一直并下去），
 * 不能用累计后的段落长度去判断——否则累计超过阈值时并段链会提前中断。
 */
function mergeSentenceBlocks(text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const out: string[] = []
  let prevJoinable = false
  for (const block of blocks) {
    const joinable = isShortSentence(block)
    if (out.length > 0 && prevJoinable && joinable) {
      out[out.length - 1] = `${out[out.length - 1]} ${block}`
    } else {
      out.push(block)
    }
    prevJoinable = joinable
  }
  return out.join('\n\n')
}

function renderMarkdown(text: string): string {
  const { masked, fences } = maskFences(text)
  const merged = mergeSentenceBlocks(masked).replace(
    /\u0000F(\d+)\u0000/g,
    (_m, i: string) => fences[Number(i)] ?? '',
  )
  return merged
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

// rAF 节流
let rafId: number | null = null
let pending = ''
watch(() => props.source, (v) => {
  pending = v
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rendered.value = renderMarkdown(pending)
    rafId = null
  })
}, { immediate: true })

onUnmounted(() => { if (rafId !== null) cancelAnimationFrame(rafId) })
</script>

<template>
  <div class="chat-markdown" v-html="rendered" />
</template>

<style scoped>
.chat-markdown :deep(code) {
  background: rgba(255,200,180,0.3);
  padding: 1px 5px; border-radius: 4px; font-size: 12px;
}
.chat-markdown :deep(pre) {
  background: rgba(0,0,0,0.05); padding: 10px; border-radius: 8px; overflow-x: auto;
}
.chat-markdown :deep(strong) { color: #ff8a65; }
</style>