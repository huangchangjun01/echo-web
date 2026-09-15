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
        :class="{ 'traits-tab__preset-chip--active': p.key === store.activePresetType }"
        @click="applyPreset(p)"
      >
        {{ p.label }}
        <!--
          「使用中」徽标:仅当该 chip 与 store.activePresetType 一致时显示,
          表示 chat 回复时真正在读该 preset 的 OCEAN。
          视觉上与「当前预设」(本地编辑中的)区分——后者可能用户点 chip
          但还没保存,active 才是真正生效的。
        -->
        <span
          v-if="p.key === store.activePresetType"
          class="traits-tab__preset-badge"
          title="当前 chat 回复基于此预设"
        >使用中</span>
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
      <!--
        「使用性格」按钮:仅切换 active preset(让 chat 读该预设的 OCEAN),
        不写五维 —— 即使用户当前在编辑的 OCEAN 与该 preset 不一致也能切。
        与「保存五维性格配置」职责拆分:
          - 保存按钮:落库当前 preset 的五维
          - 使用性格:仅切 active(后端 upsert role_active_preset)
        若当前 preset 与 store.activePresetType 一致 → 按钮 disabled,
        避免无意义的请求与重复 toast。
      -->
      <el-button
        size="small"
        type="success"
        :disabled="store.saving || local.presetType === store.activePresetType"
        class="traits-tab__use-preset-btn"
        @click="onUsePreset"
      >使用性格</el-button>
    </div>

    <!--
      「当前使用」:真正在 chat 回复时读的 OCEAN(后端权威)。
      与上方「当前预设」的区别:
        - 当前预设:用户当前在编辑的(可能点 chip 但未保存)
        - 当前使用:已保存落库,chat 实际生效的
      保存成功后两者会一致;切换预设但未保存时,两者会不同。
    -->
    <div class="traits-tab__active">
      <span class="traits-tab__active-label">当前使用：</span>
      <strong>{{ activePresetLabel }}</strong>
      <span class="traits-tab__active-hint">（chat 回复基于此预设）</span>
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
      <el-button type="primary" @click="onSave">保存五维性格配置</el-button>
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
import { computed, reactive, ref as useRef, watch } from 'vue'
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
  /** 用户点击 chip 切换预设时(无需保存)—— 父级用于同步 activePresetType */
  (e: 'preset-change', presetType: string): void
}>()

/**
 * 从 modelValue 派生 local working copy(每次 preset 切换时重新派)。
 *
 * 多预设隔离:
 *   store.traits 是所有已保存预设的 OCEAN 列表(每 preset 一行)。
 *   切换预设的语义是「展示哪个 preset 的值」,store.traits 不被改写。
 *   local 反映当前展示的 preset;用户编辑后点保存,只写当前 preset。
 */
const local = reactive<OceanTraits>({
  roleId: props.modelValue.roleId,
  openness: props.modelValue.openness,
  conscientiousness: props.modelValue.conscientiousness,
  extraversion: props.modelValue.extraversion,
  agreeableness: props.modelValue.agreeableness,
  neuroticism: props.modelValue.neuroticism,
  presetType: props.modelValue.presetType,
})

/**
 * 同步 local 到 props.modelValue.presetType 变化。
 *
 * 触发场景:
 *   1) el-tab-pane 默认 lazy 行为下,切走再切回时可能重新挂载组件;
 *      此时 local 会基于新 modelValue 重新初始化(上方的 reactive())。
 *   2) 父级 activePresetType 变化(用户在别的入口切了预设)。
 *
 * 注意:仅当 presetType 变化时才同步,OCEAN 五维不强制覆盖 — 用户在当前 preset
 * 上已编辑但未保存的值不应被父级 modelValue 覆盖。
 */
watch(
  () => props.modelValue.presetType,
  (newPreset, oldPreset) => {
    if (newPreset === oldPreset) return
    const saved = store.findTraitsByPreset(newPreset)
    if (saved) {
      // 该 preset 已有保存值 → 用保存值覆盖 local(包括五维)
      Object.assign(local, saved)
    } else {
      // 该 preset 未保存过 → 套用预设基线
      const presetDef = store.presets.find((p) => p.key === newPreset)
      if (presetDef) {
        Object.assign(local, {
          roleId: props.modelValue.roleId,
          openness: presetDef.openness,
          conscientiousness: presetDef.conscientiousness,
          extraversion: presetDef.extraversion,
          agreeableness: presetDef.agreeableness,
          neuroticism: presetDef.neuroticism,
          presetType: newPreset,
        })
      } else {
        // 兜底:仅切换 presetType,五维保留
        local.presetType = newPreset as OceanTraits['presetType']
      }
    }
  },
)

const currentPreset = computed<OceanPreset | null>(
  () => store.presets.find((p) => p.key === local.presetType) ?? null,
)
const currentPresetLabel = computed(() => currentPreset.value?.label ?? local.presetType)

/**
 * 当前真正生效的 preset(后端权威,store.activePresetType)。
 * 用于 chip 上的「使用中」徽标 + 预设区下方的「当前使用」展示行。
 *
 * 与 currentPresetLabel 的差别:
 *   - currentPresetLabel: 用户当前在编辑的(本地 local.presetType)
 *   - activePresetLabel:  chat 回复时实际读的(后端 role_active_preset 表)
 */
const activePreset = computed<OceanPreset | null>(
  () => store.presets.find((p) => p.key === store.activePresetType) ?? null,
)
const activePresetLabel = computed(
  () => activePreset.value?.label ?? store.activePresetType,
)

/**
 * 把预设的 OCEAN 值应用到 sliders,同时切换 presetType。
 *
 * 行为:
 *   - 若该 role 此前已保存该 preset(在 store.traits 列表中找到对应行)
 *     → 保留 store 中已保存的 OCEAN 值(不覆盖用户自定义)
 *   - 否则 → 套用预设基线值(preview 形态)
 *
 * 注意:此处仅切换「编辑中的 preset」,不切换 active 预设(由「使用性格」按钮
 * 显式触发)。chip 切换也不弹 toast 提示 —— 用户已在 UI 上看到 chip 变化,
 * 再弹一次"已切换到..."是冗余信息。
 *
 * 修复(OCEAN 互窜 bug):
 *   历史上 store.traits 是单条记录,这里用 `saved.presetType === p.key` 判定
 *   是否保留自定义值。但切到其他预设保存后,saved.presetType 就变了,导致
 *   切回原预设时走 else 分支被基线覆盖,自定义值丢失。
 *   修复后,store.traits 是按 preset 隔离的列表,任何 preset 的自定义值都
 *   独立保留,不再互相覆盖。
 */
function applyPreset(p: OceanPreset) {
  const saved = store.findTraitsByPreset(p.key)
  if (saved) {
    // 该 preset 此前已保存 → 展示用户自定义值
    local.openness = saved.openness
    local.conscientiousness = saved.conscientiousness
    local.extraversion = saved.extraversion
    local.agreeableness = saved.agreeableness
    local.neuroticism = saved.neuroticism
  } else {
    // 该 preset 此前未保存 → 套用预设基线
    local.openness = p.openness
    local.conscientiousness = p.conscientiousness
    local.extraversion = p.extraversion
    local.agreeableness = p.agreeableness
    local.neuroticism = p.neuroticism
  }
  // p.key 由后端 key 规则保证是 PresetType 字面量之一(或用户自定义)
  // 这里用 as 是因为 local.presetType 是字面量联合类型,允许扩展后用户自定义 key。
  local.presetType = p.key as OceanTraits['presetType']
  // 通知父级更新 activePresetType,使切换后切走再回来 chip 仍保留用户选择
  emit('preset-change', p.key)
}

/**
 * 「使用性格」按钮:仅切换 active preset(让 chat 回复时读该预设的 OCEAN),
 * 不写五维。即使用户当前在编辑的 OCEAN 与该 preset 不一致也能切。
 *
 * 校验:
 *   - roleId 必填(空时一般不会到这里,模板已禁用按钮)
 *   - presetType 与当前 active 一致时按钮 disabled,无需重复请求
 */
async function onUsePreset() {
  if (!props.modelValue.roleId) {
    ElMessage.warning('请先选择角色')
    return
  }
  if (local.presetType === store.activePresetType) return
  try {
    await store.setActivePreset(props.modelValue.roleId, local.presetType)
    ElMessage.success(`已使用「${currentPresetLabel.value}」`)
  } catch (e) {
    const err = e as { message?: string }
    ElMessage.error(err.message ?? '切换失败')
  }
}

function onSave() {
  emit('update:modelValue', { ...local })
  emit('save')
}

function onReset() {
  // 重置到当前 preset 的已保存值(若有),否则到预设基线
  const saved = store.findTraitsByPreset(local.presetType)
  const cur = currentPreset.value
  Object.assign(local, {
    roleId: props.modelValue.roleId,
    openness: saved?.openness ?? cur?.openness ?? 0,
    conscientiousness: saved?.conscientiousness ?? cur?.conscientiousness ?? 0,
    extraversion: saved?.extraversion ?? cur?.extraversion ?? 0,
    agreeableness: saved?.agreeableness ?? cur?.agreeableness ?? 0,
    neuroticism: saved?.neuroticism ?? cur?.neuroticism ?? 0,
    presetType: local.presetType,
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
/*
 * 「使用性格」按钮 —— 与「当前预设」同行,视觉上比 chip 行重一些,
 * 让用户能找到"切换生效预设"的明确入口。
 */
.traits-tab__use-preset-btn {
  margin-left: 0.4rem;
}
/*
 * 「使用中」徽标:在 chip 内嵌一个金色小标签,提示该 preset 是 chat 真正在用的。
 * 仅在 active preset 的 chip 上渲染,与「当前预设」编辑态区分。
 */
.traits-tab__preset-badge {
  margin-left: 0.4rem;
  padding: 0 0.35rem;
  font-size: 0.7rem;
  line-height: 1.4;
  border-radius: 0.25rem;
  background: rgba(64, 158, 255, 0.85);
  color: #fff;
  vertical-align: middle;
}
/* 当前 active chip:加一圈柔和高亮,即使未在编辑也一眼能识别 */
.traits-tab__preset-chip--active {
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.5);
}
/*
 * 「当前使用」行:与「当前预设」同样排版,但加色块高亮以区分(active 是
 * 真正生效的,编辑中的 preset 可能还未保存)。
 */
.traits-tab__active {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
  padding: 0.3rem 0.6rem;
  background: rgba(64, 158, 255, 0.08);
  border-left: 2px solid rgba(64, 158, 255, 0.6);
  border-radius: 0.25rem;
}
.traits-tab__active-label {
  color: rgba(255, 255, 255, 0.5);
}
.traits-tab__active-hint {
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.75rem;
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