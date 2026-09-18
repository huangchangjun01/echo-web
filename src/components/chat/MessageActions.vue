<script setup lang="ts">
import type { Message } from '@/types/chat'

const props = defineProps<{ message: Message }>()
const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'tts'): void
  (e: 'feedback', value: 'up' | 'down'): void
}>()

async function copy() {
  try {
    await navigator.clipboard.writeText(props.message.content)
  } catch (e) {
    // Fallback for older browsers: use a temporary textarea
    const ta = document.createElement('textarea')
    ta.value = props.message.content
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(ta)
    }
  }
  emit('copy')
}
</script>

<template>
  <div class="message-actions">
    <button class="action-btn" @click="copy" title="复制">📋</button>
    <button class="action-btn" @click="emit('tts')" title="朗读">🔊</button>
    <button class="action-btn" @click="emit('feedback', 'up')" title="赞">👍</button>
    <button class="action-btn" @click="emit('feedback', 'down')" title="踩">👎</button>
  </div>
</template>

<style scoped>
.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: #d4a78a;
  justify-content: flex-end;
}
.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
}
.action-btn:hover {
  background: rgba(255, 200, 180, 0.2);
}
</style>