<template>
  <div class="debug-panel" :class="{ 'debug-panel--collapsed': collapsed }">
    <div class="debug-panel__header">
      <h3>调试面板</h3>
      <el-button
        text
        :icon="collapsed ? ArrowDown : ArrowUp"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? '展开' : '收起' }}
      </el-button>
    </div>

    <div v-show="!collapsed" class="debug-panel__body">
      <div v-if="!snapshot" v-loading="loading" class="debug-panel__loading">
        加载中...
      </div>
      <template v-else>
        <!-- 1. 人设快照 -->
        <section class="debug-panel__section">
          <h4>👤 人设快照</h4>
          <div v-if="snapshot.persona" class="debug-panel__persona">
            <p><strong>身份：</strong>{{ snapshot.persona.identity || '(空)' }}</p>
            <p><strong>背景：</strong>{{ snapshot.persona.background || '(空)' }}</p>
            <p v-if="snapshot.persona.traitsTags?.length">
              <strong>性格标签：</strong>{{ snapshot.persona.traitsTags.join('、') }}
            </p>
            <p v-if="snapshot.persona.values?.length">
              <strong>价值观：</strong>{{ snapshot.persona.values.join('；') }}
            </p>
            <p><strong>语气：</strong>{{ snapshot.persona.speakingStyle || '(默认)' }}</p>
          </div>
          <p v-else class="debug-panel__empty">未设置人格</p>
        </section>

        <!-- 2. 心情曲线 -->
        <section class="debug-panel__section">
          <h4>💭 心情状态</h4>
          <div v-if="snapshot.mood" class="debug-panel__mood">
            <div class="debug-panel__mood-row">
              <span>即时：</span>
              <span :class="moodColorClass(snapshot.mood.instantVal)">
                {{ formatVal(snapshot.mood.instantVal) }} / {{ snapshot.mood.instantEmotion }}
              </span>
            </div>
            <div class="debug-panel__mood-row">
              <span>短期：</span>
              <span :class="moodColorClass(snapshot.mood.shortVal)">
                {{ formatVal(snapshot.mood.shortVal) }} / {{ snapshot.mood.shortEmotion }}
              </span>
            </div>
            <div class="debug-panel__mood-row">
              <span>基线：</span>
              <span :class="moodColorClass(snapshot.mood.baselineVal)">
                {{ formatVal(snapshot.mood.baselineVal) }} / {{ snapshot.mood.baselineEmotion }}
              </span>
            </div>
          </div>
          <p v-else class="debug-panel__empty">暂无心情数据</p>
        </section>

        <!-- 3. 关系值 -->
        <section class="debug-panel__section">
          <h4>💕 关系值</h4>
          <div v-if="snapshot.relationship" class="debug-panel__rel">
            <div class="debug-panel__rel-row">
              <span>亲密度：</span>
              <el-progress :percentage="Math.round(snapshot.relationship.intimacy * 100)" :stroke-width="6" />
            </div>
            <div class="debug-panel__rel-row">
              <span>信任：</span>
              <el-progress :percentage="Math.round(snapshot.relationship.trust * 100)" :stroke-width="6" />
            </div>
            <div class="debug-panel__rel-row">
              <span>满意度：</span>
              <el-progress :percentage="Math.round(snapshot.relationship.satisfaction * 100)" :stroke-width="6" />
            </div>
            <p class="debug-panel__co-days">
              📅 已陪伴 <strong>{{ snapshot.relationship.coDays }}</strong> 天
            </p>
          </div>
        </section>

        <!-- 4. 信念列表 -->
        <section class="debug-panel__section">
          <h4>🧠 信念清单 ({{ snapshot.beliefs?.length ?? 0 }})</h4>
          <div v-if="snapshot.beliefs && snapshot.beliefs.length > 0">
            <div
              v-for="b in snapshot.beliefs"
              :key="b.id"
              class="debug-panel__belief"
            >
              <div class="debug-panel__belief-topic">{{ b.topic }}</div>
              <div class="debug-panel__belief-stance">{{ b.stance }}</div>
              <div class="debug-panel__belief-meta">
                <el-tag size="small">{{ sourceLabel(b.source) }}</el-tag>
                <span class="debug-panel__belief-conf">置信度 {{ Math.round(b.confidence * 100) }}%</span>
              </div>
            </div>
          </div>
          <p v-else class="debug-panel__empty">暂无信念</p>
        </section>

        <!-- 5. OCEAN 雷达 -->
        <section v-if="snapshot.traits" class="debug-panel__section">
          <h4>🎯 OCEAN 五维</h4>
          <OceanRadar :traits="snapshot.traits" :size="220" />
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import OceanRadar from '@/components/OceanRadar.vue'
import type { CoreSnapshot } from '@/types/roleCore'
import { useRoleCoreStore } from '@/stores/roleCore'

const props = defineProps<{
  roleId: number | null
}>()

const store = useRoleCoreStore()
const loading = computed(() => store.loading)
const snapshot = computed<CoreSnapshot | null>(() => store.coreSnapshot)
const collapsed = ref(false)

function formatVal(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

function moodColorClass(v: number): string {
  if (v >= 0.5) return 'mood-positive-strong'
  if (v > 0) return 'mood-positive-weak'
  if (v >= -0.5) return 'mood-negative-weak'
  return 'mood-negative-strong'
}

function sourceLabel(s: string): string {
  const map: Record<string, string> = {
    user_edit: '手动',
    memory_extract: 'LLM抽取',
    dialogue: '对话',
    feedback: '反馈',
  }
  return map[s] ?? s
}

async function ensureLoaded() {
  if (!props.roleId) return
  await store.loadCoreSnapshot(props.roleId)
}

onMounted(() => {
  ensureLoaded()
})

watch(
  () => props.roleId,
  () => ensureLoaded(),
)

const Math = window.Math
</script>

<style scoped>
.debug-panel {
  background: rgba(10, 10, 16, 0.85);
  border-radius: 0.6rem;
  padding: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
}

.debug-panel--collapsed .debug-panel__body {
  display: none;
}

.debug-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.debug-panel__header h3 {
  margin: 0;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.9);
}

.debug-panel__loading {
  text-align: center;
  padding: 1.5rem;
  color: rgba(255, 255, 255, 0.5);
}

.debug-panel__section {
  margin-bottom: 1rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.debug-panel__section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.debug-panel__section h4 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.8);
}

.debug-panel__persona p {
  margin: 0.2rem 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.4;
}

.debug-panel__mood-row,
.debug-panel__rel-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  font-size: 0.78rem;
}

.debug-panel__mood-row > span:first-child {
  color: rgba(255, 255, 255, 0.5);
  min-width: 3rem;
}

.debug-panel__mood-row > span:last-child {
  flex: 1;
  font-variant-numeric: tabular-nums;
}

.mood-positive-strong { color: #ffd966; }
.mood-positive-weak { color: #a8d8a8; }
.mood-negative-weak { color: #93c5fd; }
.mood-negative-strong { color: #c4b5fd; }

.debug-panel__rel-row {
  align-items: center;
}

.debug-panel__rel-row > span:first-child {
  min-width: 4rem;
  color: rgba(255, 255, 255, 0.5);
}

.debug-panel__co-days {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.7);
}

.debug-panel__belief {
  padding: 0.4rem 0.5rem;
  margin-bottom: 0.4rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 0.4rem;
  border-left: 3px solid rgba(120, 180, 255, 0.5);
}

.debug-panel__belief-topic {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.debug-panel__belief-stance {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 0.2rem;
}

.debug-panel__belief-meta {
  margin-top: 0.3rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
}

.debug-panel__belief-conf {
  font-variant-numeric: tabular-nums;
}

.debug-panel__empty {
  margin: 0.5rem 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
}
</style>