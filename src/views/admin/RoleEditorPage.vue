<template>
  <div class="role-editor">
    <div class="role-editor__header">
      <div class="role-editor__title-row">
        <el-tooltip
          :content="TIP_ROLE_EDITOR"
          placement="bottom"
          popper-class="trait-tooltip"
          :show-after="200"
        >
          <h2 class="role-editor__title-hint">角色编辑器</h2>
        </el-tooltip>
        <el-select
          v-model="selectedRoleId"
          class="role-editor__selector"
          :disabled="!roleOptions.length || rolesStore.loading"
          :placeholder="selectorPlaceholder"
        >
          <el-option
            v-for="opt in roleOptions"
            :key="opt.id"
            :label="opt.name"
            :value="opt.id"
          />
        </el-select>
      </div>
      <p class="role-editor__hint">
        管理你的角色「<strong>{{ currentRole?.name ?? roleId }}</strong>」的人格、性格、信念、关系值。
      </p>
    </div>

    <el-tabs v-model="activeTab" class="role-editor__tabs">
      <el-tab-pane label="人格" name="persona">
        <PersonaTab
          v-if="persona"
          :model-value="persona"
          @update:model-value="onPersonaUpdate"
          @save="onPersonaSave"
        />
        <div v-else class="role-editor__empty">
          <el-empty :description="personaEmptyDesc">
            <el-button type="primary" :disabled="!roleId" @click="onCreatePersona">
              新建人格
            </el-button>
          </el-empty>
        </div>
      </el-tab-pane>

      <el-tab-pane label="性格" name="traits">
        <TraitsTab
          v-if="traits"
          :model-value="traits"
          @update:model-value="onTraitsUpdate"
          @apply-preset="onApplyPreset"
          @save="onTraitsSave"
        />
        <div v-else class="role-editor__empty">
          <el-empty :description="traitsEmptyDesc">
            <el-button type="primary" :disabled="!roleId" @click="onCreateTraits">
              使用默认预设
            </el-button>
          </el-empty>
        </div>
      </el-tab-pane>

      <el-tab-pane label="信念" name="beliefs">
        <BeliefsTab :key="`beliefs-${roleId}`" :role-id="roleId" />
      </el-tab-pane>

      <el-tab-pane label="关系值" name="relationship">
        <RelationshipTab :key="`rel-${roleId}`" :role-id="roleId" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useRoleCoreStore } from '@/stores/roleCore'
import { useRolesStore } from '@/stores/roles'
import type { OceanTraits, RolePersona } from '@/types/roleCore'
import { TIP_ROLE_EDITOR } from '@/types/roleCoreTooltips'
import PersonaTab from './roleEditor/PersonaTab.vue'
import TraitsTab from './roleEditor/TraitsTab.vue'
import BeliefsTab from './roleEditor/BeliefsTab.vue'
import RelationshipTab from './roleEditor/RelationshipTab.vue'

const route = useRoute()
const router = useRouter()
const store = useRoleCoreStore()
const rolesStore = useRolesStore()

const activeTab = ref<'persona' | 'traits' | 'beliefs' | 'relationship'>('persona')

// 优先取 URL :roleId，其次取 store 持久化值，最后默认当前活跃角色
const routeRoleId = computed(() => {
  const raw = route.params.roleId
  if (raw) {
    const n = Number(Array.isArray(raw) ? raw[0] : raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (store.currentRoleId) return store.currentRoleId
  // 兜底：取当前角色列表里第一个
  if (rolesStore.roles && rolesStore.roles.length > 0) {
    return Number(rolesStore.roles[0].id)
  }
  return 0
})

const roleId = computed(() => routeRoleId.value)
const currentRole = computed(() =>
  rolesStore.roles?.find((r) => Number(r.id) === roleId.value),
)

// 角色下拉选项：来源是全局角色列表(已经由 AdminLayout 拉取并 reactive)
// 注意:此处只读取,不修改 rolesStore.currentRoleId —— 角色编辑器的角色选择是
// 页面级(local)状态,与 chat/记忆模块所使用的"全局当前角色"解耦。
const roleOptions = computed(() => rolesStore.roles ?? [])
const selectedRoleId = computed<number | null>({
  get() {
    return roleId.value || null
  },
  set(v) {
    // el-select v-model 双向绑定：赋值时直接走 router 推 URL,
    // routeRoleId 会反向重算并刷新 selectedRoleId.get(),UI 自动同步。
    // 同值短路,避免重复 router.push 引起路由抖动。
    if (!v || v === roleId.value) return
    router.push({ name: 'AdminRoleEditor', params: { roleId: String(v) } })
  },
})
const selectorPlaceholder = computed(() => {
  if (rolesStore.loading) return '加载角色中…'
  if (roleOptions.value.length === 0) return '请先在角色管理新建角色'
  return '请选择角色'
})

const persona = computed<RolePersona | null>(() =>
  store.persona && store.persona.roleId === roleId.value
    ? store.persona
    : store.persona,
)
const traits = computed<OceanTraits | null>(() =>
  store.traits && store.traits.roleId === roleId.value
    ? store.traits
    : store.traits,
)

// 空态文案：明确告诉用户是为哪个角色、缺哪块数据,避免笼统的"暂无数据"
const personaEmptyDesc = computed(() => {
  const name = currentRole.value?.name
  return name
    ? `角色「${name}」还没有设置人格，点击下方按钮开始填写`
    : '请先在角色列表选择一个角色'
})
const traitsEmptyDesc = computed(() => {
  const name = currentRole.value?.name
  return name
    ? `角色「${name}」还没有 OCEAN 五维性格，点击下方按钮用默认预设初始化`
    : '请先在角色列表选择一个角色'
})

async function ensureLoaded() {
  if (!roleId.value) {
    ElMessage.warning('请先在角色列表选择一个角色')
    return
  }
  // 若 store 里的 roleId 不一致，重新加载
  if (
    store.currentRoleId !== roleId.value ||
    (store.persona === null && store.traits === null)
  ) {
    try {
      await store.loadAll(roleId.value)
    } catch (e) {
      // 加载失败时不让空态 UI 失效：把 persona/traits 显式置空,
      // 让角色编辑器继续展示空态,避免一次请求异常导致整页不可用。
      const err = e as { message?: string }
      console.error('[RoleEditor] loadAll failed:', err.message ?? e)
      store.persona = null
      store.traits = null
    }
  }
}

onMounted(async () => {
  if (rolesStore.bootstrapped === false) {
    try {
      await rolesStore.fetchRoles()
    } catch {
      // 角色列表拉取失败时继续：后续无角色也能进入编辑器空态
    }
  }
  store.bootstrap()
  await ensureLoaded()
})

watch(
  () => roleId.value,
  async (v) => {
    if (v) await store.loadAll(v)
  },
)

async function onPersonaUpdate(v: RolePersona) {
  // PersonaTab 自己已经做了过滤；store 只更新本地态，不主动 save
  store.persona = v
}
async function onPersonaSave(silent?: boolean) {
  if (!persona.value) return
  try {
    await store.savePersona(persona.value)
    // silent=true: 标签/价值观/禁忌的回车自动落库,不打扰用户
    if (!silent) ElMessage.success('人格已保存')
  } catch (e) {
    const err = e as { message?: string }
    ElMessage.error(err.message ?? '保存失败')
  }
}

async function onTraitsUpdate(v: OceanTraits) {
  store.traits = v
}
async function onTraitsSave(silent?: boolean) {
  if (!traits.value) return
  try {
    const saved = await store.saveTraits(traits.value)
    // chip 切预设自动保存时(silent=true)不弹成功 toast,避免频繁切预设被刷屏
    if (!silent) ElMessage.success('OCEAN 已保存')
    // chip 切预设的"大变更"是用户明确意图(他就是要切到那个预设的基线),不应再弹 warning 让他点确认
    if (saved?.warning && !silent) {
      ElMessage({
        type: 'warning',
        message: saved.warning,
        duration: 5000,
        showClose: true,
      })
    }
  } catch (e) {
    const err = e as { message?: string }
    ElMessage.error(err.message ?? '保存失败')
  }
}

function onApplyPreset(preset: string) {
  // store.applyPresetLocally 是 M1 的本地切换；保存时再走 service 层硬上限
  // 这里我们仅同步 presetType 到 traits，然后由用户点保存生效
  if (!traits.value) return
  store.applyPresetLocally(preset as OceanTraits['presetType'])
}

/**
 * 从空态的「新建人格」入口进来：
 *   初始化一份空白人格塞进 store（roleId 已带上，savePersona 会自动 upsert），
 *   PersonaTab 会立即出现，用户填完点保存即落库。
 */
function onCreatePersona() {
  if (!roleId.value) {
    ElMessage.warning('请先选择一个角色')
    return
  }
  store.persona = {
    roleId: roleId.value,
    identity: '',
    background: '',
    traitsTags: [],
    values: [],
    speakingStyle: '',
    taboos: [],
    exampleDialogs: [],
  }
  ElMessage.info('已为你创建空白人格，填写完成后点击「保存人格」即可入库')
}

/**
 * 从空态的「使用默认预设」入口进来：
 *   直接套用「标准陪伴」预设（OCEAN 五维全 0 + presetType），用户可在滑块上微调后保存。
 */
function onCreateTraits() {
  if (!roleId.value) {
    ElMessage.warning('请先选择一个角色')
    return
  }
  store.traits = {
    roleId: roleId.value,
    openness: 0,
    conscientiousness: 0,
    extraversion: 0,
    agreeableness: 0,
    neuroticism: 0,
    presetType: 'companion_default',
  }
  ElMessage.info('已套用默认预设，可在滑块上微调后点击「保存 OCEAN」入库')
}
</script>

<style scoped>
.role-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  max-width: 60rem;
  margin: 0 auto;
}

.role-editor__header h2 {
  margin: 0 0 0.4rem;
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.95);
}

/* 标题行：左标题 + 右角色下拉 —— 仅影响本编辑器,不联动全局当前角色 */
.role-editor__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.role-editor__title-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: default;
  margin: 0;
}
.role-editor__selector {
  width: clamp(10rem, 28vw, 16rem);
  flex-shrink: 0;
}

.role-editor__hint {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
}

.role-editor__tabs {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.6rem;
  padding: 0.5rem;
}

.role-editor__empty {
  padding: 1.5rem 0;
  /* 让 el-empty 的描述文字颜色适配暗色主题 */
  :deep(.el-empty__description p) {
    color: rgba(255, 255, 255, 0.7);
  }
  :deep(.el-empty__bottom) {
    margin-top: 0.5rem;
  }
}
</style>