<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{ source: string }>()
const rendered = ref('')

function renderMarkdown(text: string): string {
  return text
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