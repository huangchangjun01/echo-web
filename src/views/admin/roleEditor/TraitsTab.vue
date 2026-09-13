<template>
  <div class="traits-tab">
    <div class="traits-tab__header">
      <div class="traits-tab__title">
        <el-tooltip
          :content="TIP_OCEAN_INTRO"
          placement="top"
          popper-class="trait-tooltip"
          :show-after="200"
        >
          <h3 class="traits-tab__title-with-hint">OCEAN 五维性格</h3>
        </el-tooltip>
        <p class="traits-tab__hint">
          五维连续值 ∈ [-1, 1]，单步调整上限 0.05（PRD 铁律 #2）。
          预设可增删改：标准陪伴不可删,其他 5 个参考预设可自由管理。
        </p>
      </div>
      <div class="traits-tab__header-actions">
        <el-button size="small" type="primary" :icon="Plus" @click="openCreateDialog">
          新增预设
        </el-button>
      </div>
    </div>

    <div class="traits-tab__presets-bar">
      <el-tag
        v-for="p in store.presets"
        :key="p.id"
        :type="p.key === local.presetType ? 'primary' : 'info'"
        :effect="p.key === local.presetType ? 'dark' : 'plain'"
        class="traits-tab__preset-chip"
        @click="applyPreset(p)"
      >
        {{ p.label }}
        <!--
          hover 才出现的红色 X：点击触发删除流程。
          - 标准陪伴(is_protected=true):直接 toast 警告,不弹 confirm
          - 其他预设:弹 ElMessageBox.confirm,确认后删除
          @click.stop 阻止冒泡到 el-tag,避免同时触发 applyPreset
        -->
        <el-icon
          class="traits-tab__preset-x"
          :title="p.isProtected ? '该预设受保护,不可删除' : '删除该预设'"
          @click.stop="onDeleteChip(p)"
        >
          <Close />
        </el-icon>
      </el-tag>
      <span v-if="!store.presetsLoaded" class="traits-tab__preset-loading">
        加载预设中…
      </span>
    </div>

    <div class="traits-tab__current">
      <span class="traits-tab__current-label">当前预设：</span>
      <strong>{{ currentPresetLabel }}</strong>
    </div>

    <div class="traits-tab__content">
      <div class="traits-tab__sliders">
        <TraitSlider v-model="local.openness" label="开放性" abbreviation="O" :tooltip="OCEAN_TIPS.O" />
        <TraitSlider v-model="local.conscientiousness" label="尽责性" abbreviation="C" :tooltip="OCEAN_TIPS.C" />
        <TraitSlider v-model="local.extraversion" label="外向性" abbreviation="E" :tooltip="OCEAN_TIPS.E" />
        <TraitSlider v-model="local.agreeableness" label="宜人性" abbreviation="A" :tooltip="OCEAN_TIPS.A" />
        <TraitSlider v-model="local.neuroticism" label="神经质" abbreviation="N" :tooltip="OCEAN_TIPS.N" />
      </div>

      <div class="traits-tab__radar">
        <h4>实时预览</h4>
        <OceanRadar :traits="local" :size="260" />
      </div>
    </div>

    <div class="traits-tab__actions">
      <el-button type="primary" @click="onSave">设置当前性格</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <!-- 新增 / 编辑 弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增 OCEAN 预设' : '编辑 OCEAN 预设'"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-width="6.5rem">
        <el-form-item label="标识 key" v-if="dialogMode === 'create'">
          <el-input
            v-model="form.key"
            placeholder="小写字母/数字/_/-，1~64 字符"
            maxlength="64"
            show-word-limit
          />
        </el-form-item>
        <el-form-item v-else label="标识 key">
          <el-input :model-value="form.key" disabled />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="form.label" maxlength="64" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item label="五维基线">
          <div class="traits-tab__form-grid">
            <TraitSlider v-model="form.openness" label="O 开放性" abbreviation="O" />
            <TraitSlider v-model="form.conscientiousness" label="C 尽责性" abbreviation="C" />
            <TraitSlider v-model="form.extraversion" label="E 外向性" abbreviation="E" />
            <TraitSlider v-model="form.agreeableness" label="A 宜人性" abbreviation="A" />
            <TraitSlider v-model="form.neuroticism" label="N 神经质" abbreviation="N" />
          </div>
        </el-form-item>
        <el-alert
          v-if="dialogMode === 'edit' && form.isProtected"
          type="info"
          :closable="false"
          title="该预设为「标准陪伴」等系统级预设,只能修改数值/描述,不能删除"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onSubmitDialog">{{ dialogMode === 'create' ? '创建' : '保存' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref as useRef } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close, Plus } from '@element-plus/icons-vue'
import OceanRadar from '@/components/OceanRadar.vue'
import TraitSlider from '@/components/TraitSlider.vue'
import type { OceanPreset, OceanTraits } from '@/types/roleCore'
import { OCEAN_TIPS, TIP_OCEAN_INTRO } from '@/types/roleCoreTooltips'
import { useRoleCoreStore } from '@/stores/roleCore'

const store = useRoleCoreStore()

const props = defineProps<{
  modelValue: OceanTraits
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: OceanTraits): void
  (e: 'save', silent?: boolean): void
}>()

// 内部 working copy
const local = reactive<OceanTraits>({
  roleId: props.modelValue.roleId,
  openness: props.modelValue.openness,
  conscientiousness: props.modelValue.conscientiousness,
  extraversion: props.modelValue.extraversion,
  agreeableness: props.modelValue.agreeableness,
  neuroticism: props.modelValue.neuroticism,
  presetType: props.modelValue.presetType,
})

const currentPreset = computed<OceanPreset | null>(
  () => store.presets.find((p) => p.key === local.presetType) ?? null,
)
const currentPresetLabel = computed(() => currentPreset.value?.label ?? local.presetType)

/**
 * 把预设的 OCEAN 值应用到 sliders,同时切换 presetType。
 *
 * 行为:
 *   - 若该 role 此前保存的 presetType === p.key(用户曾用此预设并保存过)
 *     → 保留 store 中已保存的 OCEAN 值(不覆盖用户自定义)
 *   - 否则 → 套用预设默认值(preview 形态)
 *
 * 修复:之前永远用预设默认值覆盖 local,导致用户保存的自定义值在切回预设时被冲掉。
 */
function applyPreset(p: OceanPreset) {
  const saved = store.traits
  if (saved && saved.presetType === p.key) {
    // 角色已用此预设并保存过 → 保留用户自定义值
    local.openness = saved.openness
    local.conscientiousness = saved.conscientiousness
    local.extraversion = saved.extraversion
    local.agreeableness = saved.agreeableness
    local.neuroticism = saved.neuroticism
    ElMessage.info(`已切换到「${p.label}」(使用已保存的自定义值)`)
  } else {
    // 首次切此预设 → preview 默认值
    local.openness = p.openness
    local.conscientiousness = p.conscientiousness
    local.extraversion = p.extraversion
    local.agreeableness = p.agreeableness
    local.neuroticism = p.neuroticism
    ElMessage.info(`已套用「${p.label}」基线,点击保存 OCEAN 生效`)
  }
  // p.key 由后端 key 规则保证是 PresetType 字面量之一(或用户自定义)
  // 这里用 as PresetType 是因为 local.presetType 是字面量联合类型,
  // 允许扩展后允许用户自定义 key(后端已校验通过)。
  local.presetType = p.key as OceanTraits['presetType']

  // chip 点击只更新 local(预览新预设的基线),不触发保存。
  //
  // 为什么不做 auto-save:
  //   当前数据模型:一个 role 只有一份 OCEAN 值(presetType + 5 维)。
  //   如果切 chip 时 auto-save,会把当前 saved OCEAN 覆盖成新预设的基线
  //   → 切回原预设时,store.traits.presetType 已不是原预设名,前面的"保留
  //   自定义值"逻辑失效,会套用预设默认 → 用户自定义值被冲掉。
  //
  // 用户需点"设置当前性格"按钮才落库。切回同预设 chip 时,
  // 上面的 saved.presetType===p.key 分支会保留用户值。
  ElMessage.info(`已切换到「${p.label}」基线,点「设置当前性格」保存`)
}

function onSave() {
  emit('update:modelValue', { ...local })
  emit('save')
}

function onReset() {
  Object.assign(local, {
    roleId: props.modelValue.roleId,
    openness: props.modelValue.openness,
    conscientiousness: props.modelValue.conscientiousness,
    extraversion: props.modelValue.extraversion,
    agreeableness: props.modelValue.agreeableness,
    neuroticism: props.modelValue.neuroticism,
    presetType: props.modelValue.presetType,
  })
}

// ===== 预设 CRUD =====

type DialogMode = 'create' | 'edit'
const dialogVisible = useRef(false)
const dialogMode = useRef<DialogMode>('create')
const editingId = useRef<number | null>(null)

interface PresetForm {
  key: string
  label: string
  description: string
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
  isProtected: boolean
}

const emptyForm = (): PresetForm => ({
  key: '',
  label: '',
  description: '',
  openness: 0,
  conscientiousness: 0,
  extraversion: 0,
  agreeableness: 0,
  neuroticism: 0,
  isProtected: false,
})
const form = reactive<PresetForm>(emptyForm())

function resetForm() {
  Object.assign(form, emptyForm())
  editingId.value = null
}

function openCreateDialog() {
  resetForm()
  dialogMode.value = 'create'
  dialogVisible.value = true
}

async function onSubmitDialog() {
  if (dialogMode.value === 'create') {
    if (!form.key.trim() || !form.label.trim()) {
      ElMessage.warning('标识 key 与显示名不可为空')
      return
    }
    if (!/^[a-z0-9_-]+$/.test(form.key)) {
      ElMessage.warning('标识 key 只能含小写字母/数字/下划线/短横线')
      return
    }
    try {
      const created = await store.createPreset({
        key: form.key.trim(),
        label: form.label.trim(),
        description: form.description.trim(),
        openness: form.openness,
        conscientiousness: form.conscientiousness,
        extraversion: form.extraversion,
        agreeableness: form.agreeableness,
        neuroticism: form.neuroticism,
      })
      ElMessage.success(`已新增预设「${created.label}」`)
      dialogVisible.value = false
    } catch (e) {
      const err = e as { message?: string }
      ElMessage.error(err.message ?? '新增失败')
    }
  } else if (editingId.value !== null) {
    if (!form.label.trim()) {
      ElMessage.warning('显示名不可为空')
      return
    }
    try {
      await store.updatePreset(editingId.value, {
        label: form.label.trim(),
        description: form.description.trim(),
        openness: form.openness,
        conscientiousness: form.conscientiousness,
        extraversion: form.extraversion,
        agreeableness: form.agreeableness,
        neuroticism: form.neuroticism,
      })
      ElMessage.success('预设已修改')
      dialogVisible.value = false
    } catch (e) {
      const err = e as { message?: string }
      ElMessage.error(err.message ?? '修改失败')
    }
  }
}

async function onDeleteChip(p: OceanPreset) {
  if (p.isProtected) {
    ElMessage.warning(`「${p.label}」受保护,不可删除`)
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除预设「${p.label}」?该预设下若已有 OCEAN 记录,presetType 字段将不再匹配任何预设(数据保留,但筛选时会显示原 key)。`,
      '删除预设',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await store.removePreset(p.id)
    // 如果删除的是当前预设,回落第一个 protected(优先 companion_default),否则回第一个
    if (local.presetType === p.key) {
      const fallback = store.presets.find((x) => x.isProtected) ?? store.presets[0]
      if (fallback) applyPreset(fallback)
    }
    ElMessage.success('预设已删除')
  } catch (e) {
    const err = e as { message?: string }
    ElMessage.error(err.message ?? '删除失败')
  }
}

// 首次挂载时拉预设字典
;(async () => {
  try {
    await store.loadPresets()
  } catch {
    // 静默:TraitsTab 即使无预设也能展示 sliders
  }
})()
</script>

<style scoped>
.traits-tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
}
.traits-tab__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.traits-tab__title h3 {
  margin: 0;
  font-size: 1rem;
}
/* 标题后的小 ? 标识,告诉用户此处可 hover 看说明 */
.traits-tab__title-with-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: default;
}
.traits-tab__hint {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  max-width: 36rem;
}
.traits-tab__presets-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.6rem 0.8rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
  min-height: 2.6rem;
}
.traits-tab__preset-chip {
  cursor: pointer;
}
/*
 * 红色 X:默认隐藏,hover chip 才显示。
 * - X 是 chip 的子元素,占据独立可点区域,用 @click.stop 防止冒泡到 chip 的应用预设。
 * - 受保护的预设也展示 X(视觉一致),但点击会被 onDeleteChip 拦截并 toast 警告。
 */
.traits-tab__preset-chip :deep(.traits-tab__preset-x) {
  display: none;
  margin-left: 0.25rem;
  cursor: pointer;
  color: #f56c6c;
  font-size: 0.85em;
  vertical-align: middle;
  transition: transform 0.15s ease;
}
.traits-tab__preset-chip:hover :deep(.traits-tab__preset-x) {
  display: inline-flex;
  align-items: center;
}
.traits-tab__preset-chip :deep(.traits-tab__preset-x):hover {
  transform: scale(1.25);
}
.traits-tab__preset-loading {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}
.traits-tab__current {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
}
.traits-tab__current-label {
  color: rgba(255, 255, 255, 0.5);
}
.traits-tab__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.2rem;
  align-items: start;
}
@media (max-width: 50rem) {
  .traits-tab__content {
    grid-template-columns: 1fr;
  }
}
.traits-tab__sliders {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.traits-tab__radar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
}
.traits-tab__actions {
  display: flex;
  gap: 0.6rem;
}
.traits-tab__form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem 1rem;
  width: 100%;
}
</style>