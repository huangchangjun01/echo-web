<template>
  <div class="ocean-radar" role="img" :aria-label="ariaLabel">
    <svg
      :viewBox="`-${size / 2} -${size / 2} ${size} ${size}`"
      :width="size"
      :height="size"
      class="ocean-radar__svg"
    >
      <!-- 背景 5 圈网格 -->
      <g class="ocean-radar__grid">
        <polygon
          v-for="r in gridLevels"
          :key="`grid-${r}`"
          :points="polygonPoints(r * maxRadius)"
          class="ocean-radar__grid-poly"
        />
      </g>

      <!-- 5 条径向轴 -->
      <g class="ocean-radar__axes">
        <line
          v-for="(dim, i) in dimensions"
          :key="`axis-${dim.key}`"
          :x1="0"
          :y1="0"
          :x2="axisX(i, maxRadius)"
          :y2="axisY(i, maxRadius)"
          class="ocean-radar__axis"
        />
      </g>

      <!-- 数据多边形 -->
      <polygon :points="dataPoints" class="ocean-radar__data" />
      <polygon :points="dataPoints" class="ocean-radar__data-fill" />

      <!-- 5 个维度点 -->
      <circle
        v-for="(dim, i) in dimensions"
        :key="`dot-${dim.key}`"
        :cx="dataPointX(i)"
        :cy="dataPointY(i)"
        r="3"
        class="ocean-radar__dot"
      />

      <!-- 5 个维度标签 -->
      <text
        v-for="(dim, i) in dimensions"
        :key="`label-${dim.key}`"
        :x="labelX(i)"
        :y="labelY(i)"
        text-anchor="middle"
        dominant-baseline="middle"
        class="ocean-radar__label"
      >
        {{ dim.label }}
      </text>

      <!-- 数值小标 -->
      <text
        v-for="(dim, i) in dimensions"
        :key="`value-${dim.key}`"
        :x="labelX(i)"
        :y="labelY(i) + 14"
        text-anchor="middle"
        dominant-baseline="middle"
        class="ocean-radar__value"
      >
        {{ formatVal(dim.value) }}
      </text>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Dimension {
  key: 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism'
  label: string
  value: number
}

const props = withDefaults(
  defineProps<{
    traits: {
      openness: number
      conscientiousness: number
      extraversion: number
      agreeableness: number
      neuroticism: number
    }
    size?: number
  }>(),
  { size: 240 },
)

const maxRadius = computed(() => props.size * 0.35)
const gridLevels = [0.25, 0.5, 0.75, 1.0]

const dimensions = computed<Dimension[]>(() => [
  { key: 'openness', label: '开放 O', value: props.traits.openness },
  { key: 'conscientiousness', label: '尽责 C', value: props.traits.conscientiousness },
  { key: 'extraversion', label: '外向 E', value: props.traits.extraversion },
  { key: 'agreeableness', label: '宜人 A', value: props.traits.agreeableness },
  { key: 'neuroticism', label: '神经质 N', value: props.traits.neuroticism },
])

const ariaLabel = computed(
  () =>
    `OCEAN 性格雷达图：开放=${formatVal(props.traits.openness)} 尽责=${formatVal(
      props.traits.conscientiousness,
    )} 外向=${formatVal(props.traits.extraversion)} 宜人=${formatVal(
      props.traits.agreeableness,
    )} 神经质=${formatVal(props.traits.neuroticism)}`,
)

// 5 个维度均匀分布，起始为正上方
function axisAngle(index: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / 5
}

function axisX(index: number, r: number): number {
  return Math.cos(axisAngle(index)) * r
}
function axisY(index: number, r: number): number {
  return Math.sin(axisAngle(index)) * r
}

function dataPointX(index: number): number {
  const v = clamp(dimensions.value[index].value)
  return axisX(index, v * maxRadius.value)
}
function dataPointY(index: number): number {
  const v = clamp(dimensions.value[index].value)
  return axisY(index, v * maxRadius.value)
}

function labelX(index: number): number {
  return axisX(index, maxRadius.value * 1.18)
}
function labelY(index: number): number {
  return axisY(index, maxRadius.value * 1.18)
}

const dataPoints = computed(() =>
  dimensions.value
    .map((_, i) => `${dataPointX(i)},${dataPointY(i)}`)
    .join(' '),
)

function polygonPoints(radius: number): string {
  const pts: string[] = []
  for (let i = 0; i < 5; i++) {
    pts.push(`${axisX(i, radius)},${axisY(i, radius)}`)
  }
  return pts.join(' ')
}

function clamp(v: number): number {
  if (v > 1) return 1
  if (v < 0.05) return 0.05 // 至少 5% 半径便于可视化
  return v
}

function formatVal(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}
</script>

<style scoped>
.ocean-radar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ocean-radar__svg {
  display: block;
}

.ocean-radar__grid-poly {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
}

.ocean-radar__axis {
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 1;
}

.ocean-radar__data-fill {
  fill: rgba(120, 180, 255, 0.25);
  stroke: none;
}

.ocean-radar__data {
  fill: none;
  stroke: rgba(120, 180, 255, 0.95);
  stroke-width: 2;
  stroke-linejoin: round;
}

.ocean-radar__dot {
  fill: rgba(120, 180, 255, 1);
  stroke: rgba(10, 10, 16, 1);
  stroke-width: 1;
}

.ocean-radar__label {
  fill: rgba(255, 255, 255, 0.9);
  font-size: 0.7rem;
  font-weight: 600;
}

.ocean-radar__value {
  fill: rgba(120, 180, 255, 0.9);
  font-size: 0.65rem;
}
</style>