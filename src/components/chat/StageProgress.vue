<script setup lang="ts">
import type { StageName, StageState } from '@/types/chat'

const props = defineProps<{ stageState: Record<StageName, StageState> }>()

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
</script>

<template>
  <div class="stage-progress">
    <div
      v-for="stage in STAGES"
      :key="stage.name"
      :class="['stage-chip', `stage-${props.stageState[stage.name]}`]"
    >
      <span class="stage-icon">{{ iconFor(props.stageState[stage.name]) }}</span>
      <span class="stage-label">{{ stage.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage-progress {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  margin-bottom: 12px;
  width: 100%;
}
.stage-chip {
  flex: 1 1 0;
  min-width: 0;
  font-size: clamp(10px, 2.2vw, 12px);
  padding: 5px 6px;
  border-radius: 999px;
  text-align: center;
  white-space: nowrap;
  transition: background-color .3s, color .3s, box-shadow .3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
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
</style>