<script setup lang="ts">
import type { Message } from '@/types/chat'

const props = defineProps<{ message: Message }>()
const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'tts'): void
  /** 反馈：up=点赞 / down=踩 / none=再次点击同一按钮视为取消 */
  (e: 'feedback', value: 'up' | 'down' | 'none'): void
}>()

/** 当前评价态：1=赞 / -1=踩 / 0=未评 */
const rating = () => (typeof props.message.rating === 'number' ? props.message.rating : 0)

function onUp() {
  emit('feedback', rating() === 1 ? 'none' : 'up')
}
function onDown() {
  emit('feedback', rating() === -1 ? 'none' : 'down')
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.message.content)
  } catch {
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
    <button
      class="action-btn"
      :class="{ 'action-btn--active-up': rating() === 1 }"
      @click="onUp"
      :title="rating() === 1 ? '取消赞' : '赞'"
    >👍</button>
    <button
      class="action-btn"
      :class="{ 'action-btn--active-down': rating() === -1 }"
      @click="onDown"
      :title="rating() === -1 ? '取消踩' : '踩'"
    >👎</button>
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
  transition: background-color 0.2s, transform 0.15s;
}
.action-btn:hover {
  background: rgba(255, 200, 180, 0.2);
}
/* 激活态：颜色 + 微微放大，强化反馈 */
.action-btn--active-up {
  background: rgba(46, 184, 131, 0.22);
  color: #2eb883;
  transform: scale(1.05);
}
.action-btn--active-down {
  background: rgba(229, 72, 77, 0.22);
  color: #e5484d;
  transform: scale(1.05);
}
</style>
