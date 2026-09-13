<template>
  <div class="trait-slider" :class="{ 'is-disabled': disabled }">
    <div class="trait-slider__header">
      <label :for="inputId" class="trait-slider__label">
        <!-- 鼠标 hover 标签即可看到本维度的语义与系统影响 -->
        <el-tooltip
          v-if="tooltip"
          :content="tooltip"
          placement="top"
          :show-after="200"
          popper-class="trait-tooltip"
        >
          <span class="trait-slider__label-text">{{ label }}</span>
        </el-tooltip>
        <span v-else>{{ label }}</span>
        <span class="trait-slider__abbr">({{ abbreviation }})</span>
      </label>
      <span class="trait-slider__value">{{ formatValue }}</span>
    </div>
    <input
      :id="inputId"
      type="range"
      min="-2"
      max="2"
      step="0.05"
      :value="modelValue"
      :disabled="disabled"
      :aria-valuemin="-2"
      :aria-valuemax="2"
      :aria-valuenow="modelValue"
      :aria-label="ariaLabel"
      class="trait-slider__input"
      @input="onInput"
    />
    <div class="trait-slider__ticks">
      <span>-2</span>
      <span>0</span>
      <span>+2</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElTooltip } from 'element-plus'

const props = withDefaults(
  defineProps<{
    modelValue: number
    label: string
    abbreviation: string
    disabled?: boolean
    /** hover 标签时显示的说明文本(本维度语义 + 系统影响) */
    tooltip?: string
  }>(),
  { disabled: false, tooltip: '' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
}>()

const inputId = computed(
  () => `trait-${props.abbreviation.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
)

const formatValue = computed(() => {
  const v = props.modelValue
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
})

const ariaLabel = computed(() => `${props.label}(${props.abbreviation})性格维度, 当前值 ${formatValue.value}`)

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  const v = parseFloat(target.value)
  if (Number.isFinite(v)) {
    emit('update:modelValue', v)
  }
}

// 显式声明 ElTooltip 为本组件依赖(Vue SFC <script setup> 不会自动注册 el-tooltip)
void ElTooltip
</script>

<style scoped>
.trait-slider {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.8rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: border-color 0.2s ease;
}
.trait-slider:hover:not(.is-disabled) {
  border-color: rgba(120, 180, 255, 0.4);
}
.trait-slider.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}
.trait-slider__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.trait-slider__label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
}
.trait-slider__label-text {
  /* 不加视觉标识,只靠 el-tooltip 在 hover 时弹说明 */
}
.trait-slider__abbr {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
}
.trait-slider__value {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(120, 180, 255, 0.95);
  font-variant-numeric: tabular-nums;
}
.trait-slider__input {
  width: 100%;
  accent-color: rgba(120, 180, 255, 0.95);
  cursor: pointer;
}
.trait-slider__input:disabled {
  cursor: not-allowed;
}
.trait-slider__ticks {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  padding: 0 0.1rem;
}
</style>

<!--
  tooltip 全局样式:深底浅字,与项目暗色主题一致。
  popper-class 在 :root 变量(已在前序任务中设为深色)的基础上进一步微调间距。
-->
<style>
.trait-tooltip {
  max-width: 22rem !important;
  font-size: 0.78rem !important;
  line-height: 1.5 !important;
}
</style>