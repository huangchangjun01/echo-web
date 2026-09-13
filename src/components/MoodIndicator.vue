<template>
  <div
    class="mood-indicator"
    role="status"
    :aria-label="ariaLabel"
    :style="{ background: bgColor, borderColor: borderColor, color: textColor }"
  >
    <span class="mood-indicator__emotion" aria-hidden="true">{{ emoji }}</span>
    <div class="mood-indicator__meta">
      <span class="mood-indicator__label">{{ label }}</span>
      <span class="mood-indicator__value">{{ valueText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMoodUpdate } from '@/types/chat'

const props = withDefaults(
  defineProps<{
    mood: ChatMoodUpdate | null
  }>(),
  { mood: null },
)

/**
 * 颜色映射（参照 PRD 07_PRD_ux_prototype.md 设计 token）：
 * - valence > 0.5  : 暖黄 #FFF8E1
 * - (0, 0.5]      : 中性 #F5F5F5
 * - [-0.5, 0]     : 冷蓝 #E3F2FD
 * - < -0.5        : 淡紫 #F3E5F5
 */
const bgColor = computed(() => {
  if (!props.mood) return 'rgba(255, 255, 255, 0.05)'
  const v = props.mood.instantVal
  if (v > 0.5) return 'rgba(255, 248, 225, 0.18)'
  if (v > 0) return 'rgba(245, 245, 245, 0.10)'
  if (v >= -0.5) return 'rgba(227, 242, 253, 0.16)'
  return 'rgba(243, 229, 245, 0.20)'
})

const borderColor = computed(() => {
  if (!props.mood) return 'rgba(255, 255, 255, 0.15)'
  const v = props.mood.instantVal
  if (v > 0.5) return 'rgba(255, 200, 100, 0.5)'
  if (v > 0) return 'rgba(200, 200, 200, 0.35)'
  if (v >= -0.5) return 'rgba(120, 180, 255, 0.5)'
  return 'rgba(180, 130, 220, 0.6)'
})

const textColor = computed(() => 'rgba(255, 255, 255, 0.95)')

const label = computed(() => {
  if (!props.mood) return '心情未知'
  const map: Record<string, string> = {
    happy: '开心',
    excited: '兴奋',
    smile: '愉悦',
    neutral: '平静',
    concerned: '担心',
    sad: '难过',
    cry: '委屈',
    angry: '生气',
    thinking: '沉思',
    disappointed: '失落',
  }
  return map[props.mood.instantEmotion] ?? props.mood.instantEmotion
})

const emoji = computed(() => {
  if (!props.mood) return '·'
  const map: Record<string, string> = {
    happy: '😊',
    excited: '🤩',
    smile: '🙂',
    neutral: '😐',
    concerned: '😟',
    sad: '😢',
    cry: '😭',
    angry: '😠',
    thinking: '🤔',
    disappointed: '😞',
  }
  return map[props.mood.instantEmotion] ?? '·'
})

const valueText = computed(() => {
  if (!props.mood) return ''
  const v = props.mood.instantVal
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
})

const ariaLabel = computed(() => {
  if (!props.mood) return '当前心情未知'
  return `当前心情: ${label.value}, 强度 ${(props.mood.instantIntensity * 100).toFixed(0)}%, valence ${valueText.value}`
})
</script>

<style scoped>
.mood-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.7rem;
  border-radius: 1rem;
  border: 1px solid;
  font-size: 0.8rem;
  user-select: none;
  transition: background 0.4s ease, border-color 0.4s ease;
  backdrop-filter: blur(8px);
}

.mood-indicator__emotion {
  font-size: 1.1rem;
  line-height: 1;
}

.mood-indicator__meta {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  line-height: 1.1;
}

.mood-indicator__label {
  font-weight: 600;
}

.mood-indicator__value {
  font-size: 0.7rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
</style>