<template>
  <div class="msg-feedback" role="group" :aria-label="ariaLabel">
    <span class="msg-feedback__label">反馈：</span>
    <div class="msg-feedback__buttons">
      <button
        v-for="opt in options"
        :key="opt.value"
        :class="['msg-feedback__btn', { 'is-active': modelValue === opt.value }]"
        :disabled="disabled"
        :aria-label="opt.ariaLabel"
        :title="opt.title"
        @click="onSelect(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
    <transition name="msg-feedback__fade">
      <span v-if="showThanks" class="msg-feedback__thanks">感谢反馈</span>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: -2 | -1 | 0 | 1 | 2
    disabled?: boolean
  }>(),
  { modelValue: 0, disabled: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: -2 | -1 | 0 | 1 | 2): void
  (e: 'submit', v: -2 | -1 | 0 | 1 | 2): void
}>()

const showThanks = ref(false)

const options = [
  { value: -2 as const, label: '👎👎', title: '强烈反对', ariaLabel: '反馈：强烈反对' },
  { value: -1 as const, label: '👎', title: '反对', ariaLabel: '反馈：反对' },
  { value: 0 as const, label: '😐', title: '中立', ariaLabel: '反馈：中立' },
  { value: 1 as const, label: '👍', title: '赞同', ariaLabel: '反馈：赞同' },
  { value: 2 as const, label: '👍👍', title: '强烈赞同', ariaLabel: '反馈：强烈赞同' },
]

const ariaLabel = computed(() => '消息反馈评分 5 档')

function onSelect(v: -2 | -1 | 0 | 1 | 2) {
  emit('update:modelValue', v)
  emit('submit', v)
  showThanks.value = true
  setTimeout(() => {
    showThanks.value = false
  }, 1500)
}
</script>

<style scoped>
.msg-feedback {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.msg-feedback__label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.msg-feedback__buttons {
  display: flex;
  gap: 0.25rem;
}

.msg-feedback__btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  border-radius: 0.4rem;
  padding: 0.25rem 0.45rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s ease;
  color: rgba(255, 255, 255, 0.85);
}

.msg-feedback__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(120, 180, 255, 0.4);
}

.msg-feedback__btn.is-active {
  background: rgba(120, 180, 255, 0.2);
  border-color: rgba(120, 180, 255, 0.6);
}

.msg-feedback__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg-feedback__thanks {
  font-size: 0.7rem;
  color: rgba(120, 200, 120, 0.9);
  margin-left: 0.4rem;
}

.msg-feedback__fade-enter-active,
.msg-feedback__fade-leave-active {
  transition: opacity 0.3s ease;
}

.msg-feedback__fade-enter-from,
.msg-feedback__fade-leave-to {
  opacity: 0;
}
</style>