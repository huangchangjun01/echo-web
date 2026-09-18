<script setup lang="ts">
import type { StageName, StageState } from '@/types/chat'

const props = defineProps<{ stageState: Record<StageName, StageState> }>()

const STAGES: { name: StageName; label: string; emoji: string }[] = [
  { name: 'intent', label: '意图', emoji: '🌸' },
  { name: 'recall_search', label: '回忆', emoji: '🌸' },
  { name: 'tool_dispatch', label: '工具', emoji: '🌸' },
  { name: 'model_reasoning', label: '推理', emoji: '🌸' },
  { name: 'answer', label: '回答', emoji: '🌸' },
]

function iconFor(name: StageName, state: StageState): string {
  if (state === 'done') return '✓'
  if (state === 'running') return '●'
  if (state === 'skipped') return '–'
  return STAGES.find(s => s.name === name)!.emoji
}
</script>

<template>
  <div class="stage-progress">
    <div
      v-for="stage in STAGES"
      :key="stage.name"
      :class="['stage-chip', `stage-${props.stageState[stage.name]}`]"
    >
      <span class="stage-icon">{{ iconFor(stage.name, props.stageState[stage.name]) }}</span>
      <span class="stage-label">{{ stage.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage-progress { display: flex; gap: 4px; margin-bottom: 12px; }
.stage-chip {
  flex: 1; font-size: 11px; padding: 7px 4px; border-radius: 999px;
  text-align: center; transition: background-color .3s, color .3s, box-shadow .3s;
}
.stage-chip.stage-idle { background: rgba(255,255,255,0.5); color: #d4a78a; }
.stage-chip.stage-running {
  background: #ff8a65; color: #fff; font-weight: 600;
  box-shadow: 0 0 0 4px rgba(255,138,102,0.25);
  animation: stagePulse 1.4s infinite;
}
.stage-chip.stage-done { background: #4ade80; color: #fff; }
.stage-chip.stage-skipped { background: rgba(0,0,0,0.06); color: #c4a78a; }
@keyframes stagePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,138,102,0.4); }
  50% { box-shadow: 0 0 0 6px rgba(255,138,102,0.15); }
}
</style>