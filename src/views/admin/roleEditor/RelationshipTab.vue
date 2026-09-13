<template>
  <div class="relationship-tab">
    <div class="relationship-tab__header">
      <el-tooltip
        :content="TIP_RELATIONSHIP"
        placement="top"
        popper-class="trait-tooltip"
        :show-after="200"
      >
        <h3 class="relationship-tab__title-hint">关系值</h3>
      </el-tooltip>
      <p class="relationship-tab__hint">
        三维关系值（亲密度 / 信任 / 满意度）随对话轮次、自我披露、反馈自动累积。
      </p>
    </div>

    <div v-loading="loading" class="relationship-tab__content">
      <div class="relationship-tab__metric">
        <div class="relationship-tab__metric-header">
          <span class="relationship-tab__metric-label">亲密度 Intimacy</span>
          <span class="relationship-tab__metric-value">{{ formatPct(snapshot.intimacy) }}</span>
        </div>
        <el-progress
          :percentage="Math.round(snapshot.intimacy * 100)"
          :stroke-width="10"
          :color="progressColor"
        />
        <p class="relationship-tab__metric-hint">自我披露 / 对话轮次 / 陪伴天数驱动</p>
      </div>

      <div class="relationship-tab__metric">
        <div class="relationship-tab__metric-header">
          <span class="relationship-tab__metric-label">信任度 Trust</span>
          <span class="relationship-tab__metric-value">{{ formatPct(snapshot.trust) }}</span>
        </div>
        <el-progress
          :percentage="Math.round(snapshot.trust * 100)"
          :stroke-width="10"
          :color="progressColor"
        />
        <p class="relationship-tab__metric-hint">正向反馈 / 建议采纳驱动，负向反馈下调</p>
      </div>

      <div class="relationship-tab__metric">
        <div class="relationship-tab__metric-header">
          <span class="relationship-tab__metric-label">满意度 Satisfaction</span>
          <span class="relationship-tab__metric-value">{{ formatPct(snapshot.satisfaction) }}</span>
        </div>
        <el-progress
          :percentage="Math.round(snapshot.satisfaction * 100)"
          :stroke-width="10"
          :color="progressColor"
        />
        <p class="relationship-tab__metric-hint">平稳衰减 + 正负反馈比率</p>
      </div>

      <div class="relationship-tab__days">
        <span class="relationship-tab__days-icon">📅</span>
        <span class="relationship-tab__days-text">
          已陪伴 <strong>{{ snapshot.coDays }}</strong> 天
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoleCoreStore } from '@/stores/roleCore'
import { TIP_RELATIONSHIP } from '@/types/roleCoreTooltips'

const props = defineProps<{
  roleId: number | null
}>()

const store = useRoleCoreStore()
const loading = computed(() => store.loading)
const snapshot = computed(() =>
  store.coreSnapshot?.relationship ?? { intimacy: 0, trust: 0, satisfaction: 0, coDays: 0 },
)

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function progressColor(percentage: number): string {
  if (percentage < 30) return '#909399'
  if (percentage < 60) return '#67c23a'
  if (percentage < 85) return '#409eff'
  return '#e6a23c'
}

async function ensureLoaded() {
  if (!props.roleId) return
  if (
    !store.coreSnapshot ||
    store.coreSnapshot.relationship === undefined
  ) {
    await store.loadCoreSnapshot(props.roleId)
  }
}

onMounted(() => {
  ensureLoaded()
})

watch(
  () => props.roleId,
  () => ensureLoaded(),
)

// Math for template
const Math = window.Math
</script>

<style scoped>
.relationship-tab {
  padding: 0.5rem 0;
}

.relationship-tab__header h3 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
}
.relationship-tab__title-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: default;
}
.relationship-tab__hint {
  margin: 0 0 1rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.relationship-tab__content {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.6rem;
}

.relationship-tab__metric {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.relationship-tab__metric-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.relationship-tab__metric-label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.relationship-tab__metric-value {
  font-variant-numeric: tabular-nums;
  color: rgba(120, 180, 255, 0.95);
  font-weight: 600;
}

.relationship-tab__metric-hint {
  margin: 0;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
}

.relationship-tab__days {
  margin-top: 0.6rem;
  padding: 0.6rem 0.8rem;
  background: rgba(120, 180, 255, 0.08);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.relationship-tab__days-icon {
  font-size: 1.2rem;
}

.relationship-tab__days-text {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.85);
}
</style>