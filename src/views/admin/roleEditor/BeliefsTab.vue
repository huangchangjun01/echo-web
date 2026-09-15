<template>
  <div class="beliefs-tab">
    <div class="beliefs-tab__header">
      <div class="beliefs-tab__title">
        <el-tooltip
          :content="TIP_BELIEFS"
          placement="top"
          popper-class="trait-tooltip"
          :show-after="200"
        >
          <h3 class="beliefs-tab__title-hint">信念清单</h3>
        </el-tooltip>
        <p class="beliefs-tab__hint">
          角色对某些话题的立场。可手动新增,也可在「演化建议」中 Apply LLM 抽取的建议。
        </p>
      </div>
      <el-button type="primary" @click="openCreateDialog">新增信念</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="beliefs"
      stripe
      style="width: 100%"
      empty-text="暂无信念,点击右上角新增"
    >
      <el-table-column prop="topic" label="主题" width="200" />
      <el-table-column prop="stance" label="立场" show-overflow-tooltip />
      <el-table-column width="120">
        <!--
          表头 tooltip:el-table-column 用 label 时只是纯字符串,hover 无效;
          用 header slot 自定义表头内容,el-tooltip 包裹,实现"鼠标移动到表头文字时弹说明"。
        -->
        <template #header>
          <el-tooltip
            :content="TIP_CONFIDENCE"
            placement="top"
            popper-class="trait-tooltip"
            :show-after="200"
          >
            <span style="display: inline-block; cursor: default">置信度</span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <!--
            el-progress 自带文字插槽但鼠标 hover 时不显示原始 confidence 值
            (后端存的是 0~1 的小数,UI 上展示的整数百分比有损精度)。
            这里外层套 el-tooltip:鼠标 hover 整列单元格时弹出原始值,
            让用户看到 0.42 / 0.85 这种更细的刻度。
          -->
          <el-tooltip
            :content="`置信度：${formatConfidence(row.confidence)}`"
            placement="top"
            popper-class="trait-tooltip"
            :show-after="150"
          >
            <div class="beliefs-tab__confidence-cell">
              <el-progress
                :percentage="Math.round(row.confidence * 100)"
                :stroke-width="8"
                :status="confidenceStatus(row.confidence)"
              />
            </div>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="sourceTagType(row.source)">{{ sourceLabel(row.source) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button
            type="primary"
            :icon="Edit"
            circle
            size="small"
            title="编辑"
            @click="openEditDialog(row)"
          />
          <el-button
            type="danger"
            :icon="Delete"
            circle
            size="small"
            title="删除"
            @click="confirmDelete(row)"
          />
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗(同一对话框,按 mode 切换标题与提交行为) -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增信念' : '编辑信念'"
      width="500px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-position="top">
        <el-form-item label="主题（≤128字）" required>
          <el-input v-model="form.topic" maxlength="128" show-word-limit placeholder="例如：用户独居" />
        </el-form-item>
        <el-form-item label="立场（详细描述）" required>
          <el-input
            v-model="form.stance"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
            placeholder="详细描述角色的立场和理由"
          />
        </el-form-item>
        <el-form-item label="置信度">
          <el-tooltip
            :content="TIP_CONFIDENCE"
            placement="top"
            popper-class="trait-tooltip"
            :show-after="200"
          >
            <!--
              把 tooltip 绑在 slider 上(而不是 label 文字)。
              slider 是块级可交互控件,盒模型稳定,hover 100% 可靠触发;
              label slot 里的 span 在某些 Element Plus 版本里会被外层 <label>
              元素的事件冒泡吃掉,导致 el-tooltip 收不到 mouseenter。
            -->
            <el-slider v-model="form.confidence" :min="0" :max="1" :step="0.05" show-input />
          </el-tooltip>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="form.source" placeholder="选择来源">
            <el-option label="用户手动录入" value="user_edit" />
            <el-option label="LLM 抽取" value="memory_extract" />
            <el-option label="对话观察" value="dialogue" />
            <el-option label="反馈触发" value="feedback" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onSubmitDialog">{{ dialogMode === 'create' ? '保存' : '保存修改' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit } from '@element-plus/icons-vue'
import type { BeliefItem } from '@/types/roleCore'
import { useRoleCoreStore } from '@/stores/roleCore'
import { TIP_BELIEFS, TIP_CONFIDENCE } from '@/types/roleCoreTooltips'

const props = defineProps<{
  roleId: number | null
}>()

const store = useRoleCoreStore()

const beliefs = computed<BeliefItem[]>(() => store.coreSnapshot?.beliefs ?? [])
const loading = computed(() => store.loading)

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const form = ref<{ topic: string; stance: string; confidence: number; source: string }>({
  topic: '',
  stance: '',
  confidence: 0.5,
  source: 'user_edit',
})

function resetForm() {
  form.value = { topic: '', stance: '', confidence: 0.5, source: 'user_edit' }
  editingId.value = null
}

function openCreateDialog() {
  if (!props.roleId) {
    ElMessage.warning('请先选择角色')
    return
  }
  resetForm()
  dialogMode.value = 'create'
  dialogVisible.value = true
}

function openEditDialog(row: BeliefItem) {
  resetForm()
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.value = {
    topic: row.topic,
    stance: row.stance,
    confidence: row.confidence,
    source: row.source,
  }
  dialogVisible.value = true
}

async function onSubmitDialog() {
  if (!form.value.topic.trim()) {
    ElMessage.warning('请填写主题')
    return
  }
  if (!form.value.stance.trim()) {
    ElMessage.warning('请填写立场')
    return
  }
  if (!props.roleId) return
  try {
    if (dialogMode.value === 'create') {
      await store.addBelief({
        roleId: props.roleId,
        topic: form.value.topic,
        stance: form.value.stance,
        confidence: form.value.confidence,
        source: form.value.source,
      })
      ElMessage.success('信念已新增')
    } else if (editingId.value !== null) {
      await store.updateBelief(editingId.value, {
        topic: form.value.topic,
        stance: form.value.stance,
        confidence: form.value.confidence,
        source: form.value.source,
      })
      ElMessage.success('信念已修改')
    }
    dialogVisible.value = false
  } catch (e) {
    const err = e as { message?: string }
    ElMessage.error(err.message ?? '保存失败')
  }
}

async function confirmDelete(row: BeliefItem) {
  try {
    await ElMessageBox.confirm(`确认删除信念「${row.topic}」?`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await store.removeBelief(row.id)
    ElMessage.success('已删除')
  } catch (e) {
    // 用户取消或删除失败
    if ((e as { message?: string }).message) {
      ElMessage.error((e as { message?: string }).message ?? '删除失败')
    }
  }
}

function confidenceStatus(c: number): 'success' | 'warning' | 'exception' {
  if (c >= 0.7) return 'success'
  if (c >= 0.4) return 'warning'
  return 'exception'
}

/**
 * 格式化置信度为可读字符串:同时给出小数(原始精度)与百分比,便于对照。
 * 例:0.42 → "0.42 (42%)"
 *
 * el-progress 自带文字只能显示整数百分比(0~100),丢精度。
 * hover tooltip 上展示完整精度,让用户能看到 0.65 / 0.85 这种细分。
 */
function formatConfidence(c: number): string {
  const clamped = Math.max(0, Math.min(1, c))
  const pct = Math.round(clamped * 100)
  return `${clamped.toFixed(2)} (${pct}%)`
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

function sourceTagType(s: string): 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info'> = {
    user_edit: 'primary',
    memory_extract: 'success',
    dialogue: 'info',
    feedback: 'warning',
  }
  return map[s] ?? 'info'
}

async function ensureLoaded() {
  if (!props.roleId) return
  if (!store.coreSnapshot || store.coreSnapshot.beliefs === undefined) {
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
.beliefs-tab {
  padding: 0.5rem 0;
}

.beliefs-tab__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.beliefs-tab__title h3 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
}
.beliefs-tab__title-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: default;
}
.beliefs-tab__hint {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

/*
 * 置信度单元格:hover 时整列触发 el-tooltip。
 * el-progress 自带 wrapper 没有占据 100% 宽度,这里用 div 包一层
 * 让 hover 区域 = 整列宽度,鼠标在 progress 附近任何位置都能看到数值。
 */
.beliefs-tab__confidence-cell {
  width: 100%;
  cursor: default;
}
</style>