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
          @preset-change="onPresetChange"
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
/**
 * 当前激活的预设 key —— 切 tab 后是否保留 chip 高亮在此决定。
 *
 * 历史:曾用 `store.traits.find(companion_default) ?? store.traits[0]` 作为
 * modelValue 来源,导致切走再回来永远是「标准陪伴」,无法保留用户选择。
 * 修复:用 ref 显式追踪,用户在 TraitsTab 内部点 chip(emit preset-change)
 * 或保存成功时同步更新。
 *
 * 进一步修复(跨页面导航场景):
 *   仅 ref 仍不够 —— 用户从「角色编辑器」导航到「角色管理」再回来时,
 *   RoleEditorPage 整个组件会被卸载重建,ref 状态全丢,activePresetType
 *   会回到默认 'companion_default'。所以这里把"用户在该角色下最后选中的
 *   preset"持久化到 localStorage,key 按 roleId 隔离(每个角色独立保留
 *   自己最后选中的 preset),组件挂载时优先从 localStorage 读回。
 */
const STORAGE_ACTIVE_PRESET = 'echo_role_core_active_preset'

function readActivePresetFromStorage(roleId: number): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_PRESET)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, string>
    return map[String(roleId)] ?? null
  } catch {
    // localStorage 不可用 / 数据损坏 → 静默回退到默认
    return null
  }
}

function writeActivePresetToStorage(roleId: number, presetType: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_PRESET)
    const map: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[String(roleId)] = presetType
    localStorage.setItem(STORAGE_ACTIVE_PRESET, JSON.stringify(map))
  } catch {
    // ignore
  }
}

/**
 * 当前「页面级 active preset」ref —— 驱动 traits computed + 「当前使用」展示。
 *
 * 关键:这个 ref 与 store.activePresetType 不再完全等价。
 *
 *   - store.activePresetType:后端权威,只在 SaveTraits / SetActivePreset / loadAll 时更新
 *   - 本 ref:用户在本页面的当前选择(含未确认的 chip-click)
 *
 * 默认值策略(组件挂载时):
 *   1) 优先 store.activePresetType(后端权威)—— 这是「当前正在使用」的性格
 *   2) 兜底用 localStorage —— 用于兼容 store 尚未加载完成的瞬间
 *   3) 都没有 → 'companion_default'
 *
 * 历史演进:
 *   - 早期:localStorage 作为跨页面导航的唯一持久化手段 → 但与后端不同步
 *   - 加入 role_active_preset 表后:后端成为权威,但 localStorage 在 mount 时
 *     抢先赋值,导致 store watcher 之后用旧 active(后端未刷新)把它覆盖回去,
 *     用户切走再回来看到的不是 active preset(就是这次的 bug)
 *   - 现在:store 是 source of truth,localStorage 仅作兜底
 *
 * 同步规则:
 *   - 用户在 chip-click / 保存 / 使用性格 时:主动更新本 ref + 写 localStorage
 *   - 后端 store 更新时(loadAll / SetActivePreset):同步给本 ref
 *   - 切换 roleId 时:重置为该角色后端的 active preset(由下方 loadAll 完成)
 */
const activePresetType = ref<string>(store.activePresetType || 'companion_default')

/**
 * 监听 activePresetType 变化 → 写入 localStorage。
 *
 * 注意:这里只是「镜像」写到 localStorage,不再用 localStorage 引导初值。
 * 跨页面导航后,store.activePresetType 会随 loadAll 重新拉取(后端权威),
 * 然后通过下面那个 store → page 同步 watcher 写到本 ref。
 *
 * 为什么还保留 localStorage 写:
 *   - store 加载完成前的极短窗口里,UI 短暂看到的是本 ref 的值。
 *   - 如果后端调用 loadAll 失败,localStorage 是最后的兜底。
 *   - 不写也无所谓,但留着不会有副作用。
 */
watch(activePresetType, (v) => {
  if (v && roleId.value) writeActivePresetToStorage(roleId.value, v)
})

/**
 * 单向同步:store.activePresetType → 本地 ref(后端权威优先)。
 *
 * 历史 bug 修复:
 *   早期 mount 路径里,localStorage 先回填了 'rational_advisor' 到本 ref,
 *   随后 store.activePresetType 因 loadAll 触发更新成 'companion_default',
 *   这个 watcher 会把它「同步」回去 —— 但用户实际想要的「当前使用」是
 *   后端 store 的值,而不是上次 chip-click 的值。
 *
 *   现在 mount 时已经把 store.activePresetType 作为本 ref 的初值,
 *   localStorage 不再抢先赋值,因此这个同步永远是把后端的状态反映到 UI,
 *   不会反过来用 stale state 覆盖后端。
 */
watch(
  () => store.activePresetType,
  (v) => {
    if (v && v !== activePresetType.value) {
      activePresetType.value = v
    }
  },
)

/**
 * 监听 roleId 变化 → 当用户切到不同角色时,先看 store 是否有缓存的 active,
 * 没有才用 localStorage 兜底。
 *
 * 历史上曾直接用 localStorage(读出来的是「上次 chip-click 但可能未保存」的值),
 * 导致切到新角色时,旧角色的临时选择被错误地套用。
 *
 * 注意:store.activePresetType 在 roleId 切换后会被新的 loadAll 异步覆盖,
 * 下方的 store → page 同步 watcher 会接着把新的 active 写进来。
 * 这里只负责「先给个不会闪烁的初值」。
 */
watch(
  () => roleId.value,
  (newRoleId) => {
    if (!newRoleId) {
      activePresetType.value = 'companion_default'
      return
    }
    // 优先用 store 缓存(同角色内可能刚刚被 SetActivePreset 更新过)
    if (store.activePresetType) {
      activePresetType.value = store.activePresetType
      return
    }
    // 兜底:同角色冷启动场景(例如跨页面导航回来,store 还没 loadAll)
    const stored = readActivePresetFromStorage(newRoleId)
    activePresetType.value = stored ?? 'companion_default'
  },
  { immediate: true },
)

/**
 * 当前展示给 TraitsTab 的 OCEAN 快照。
 *
 * 多预设隔离:store.traits 是按 preset 隔离的列表(每个 preset 一行)。
 * 这里按 activePresetType 在列表中查找对应 OCEAN 作为 modelValue:
 *   - 找到 → 用该行的 OCEAN(用户在该 preset 上的自定义值)
 *   - 未找到 → 套用预设基线值(用户尚未保存该 preset,但已选中这个 chip)
 *   - 列表为空 → 用零值空快照(允许用户开始编辑)
 *
 * 重要:「未找到」的兜底分支必须用 activePresetType 而不是 companion_default —
 * 否则用户点击 chip「理性顾问」但还没点保存时切走再回来,会显示 companion_default
 * 的值,看起来像是 chip 被重置。
 */
const traits = computed<OceanTraits | null>(() => {
  const presetKey = activePresetType.value || 'companion_default'
  // 1) 列表中有匹配 → 用用户已保存的自定义值
  const matched = store.traits.find((t) => t.presetType === presetKey)
  if (matched) return matched
  // 2) 列表中没有该 preset 的保存行 → 套用预设字典里的基线值
  //    这就是用户点 chip 但还没点保存的场景:UI 要展示该 preset 的基线,
  //    而不是 fallback 到 companion_default(否则用户以为 chip 被重置了)
  const presetDef = store.presets.find((p) => p.key === presetKey)
  if (presetDef) {
    return {
      roleId: roleId.value,
      openness: presetDef.openness,
      conscientiousness: presetDef.conscientiousness,
      extraversion: presetDef.extraversion,
      agreeableness: presetDef.agreeableness,
      neuroticism: presetDef.neuroticism,
      presetType: presetKey,
    }
  }
  // 3) 预设字典里也没有(罕见:用户切换到一个刚被删除的自定义 preset)
  //    用零值空快照兜底
  return {
    roleId: roleId.value,
    openness: 0,
    conscientiousness: 0,
    extraversion: 0,
    agreeableness: 0,
    neuroticism: 0,
    presetType: presetKey,
  }
})

/**
 * 当 store.traits 变化时(数据加载完成 / 切换角色) → 不再用「localStorage 兜底」校正。
 *
 * 历史 bug:此 watcher 早期逻辑是「如果 localStorage 记录的值存在,就用 localStorage
 * 覆盖回来」。这导致 store.activePresetType 在 loadAll 后用后端值同步给本 ref,
 * 紧接着这个 watcher 又用 localStorage(用户上次 chip-click 但未「使用性格」的值)
 * 把它覆盖回去,用户切走再回来看到的不是后端 active preset —— 就是这次的 bug。
 *
 * 现在 active preset 由后端 role_active_preset 表权威管理:
 *   - store.activePresetType 是后端权威的镜像
 *   - 上面的 store → page 同步 watcher 已经把后端值反映到本 ref
 *   - 这里不再做二次校正,让「当前使用」始终 = 后端 active preset
 *
 * 保留 immediate: true 是为了让 watch 链路在测试中可观察;无副作用。
 */
watch(
  () => store.traits,
  () => {
    // no-op —— store.activePresetType watcher 已经处理 active preset 同步
  },
  { immediate: true },
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

async function ensureLoaded(force = false) {
  if (!roleId.value) {
    ElMessage.warning('请先在角色列表选择一个角色')
    return
  }
  // 是否需要重新加载:
  //   - 角色不匹配 → 必须重载
  //   - 数据全空 → 必须重载(从未加载)
  //   - force=true → 强制重载(用于 mount 时,确保后端 activePresetType 最新)
  //
  // 历史:曾用「缓存命中就跳过」节省一次 HTTP,但跨页面导航时 store 的
  // activePresetType 可能已陈旧(例如用户在 chip-click 后切走再回来,
  // 没有调用「使用性格」,后端不会主动推)。现在 mount 强制刷新一次,
  // 让 store → page 同步 watcher 能用最新的后端值校正本地 ref。
  if (
    force ||
    store.currentRoleId !== roleId.value ||
    (store.persona === null && store.traits.length === 0)
  ) {
    try {
      await store.loadAll(roleId.value)
    } catch (e) {
      // 加载失败时不让空态 UI 失效:把 persona/traits 显式置空,
      // 让角色编辑器继续展示空态,避免一次请求异常导致整页不可用。
      const err = e as { message?: string }
      console.error('[RoleEditor] loadAll failed:', err.message ?? e)
      store.persona = null
      store.traits = []
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
  // 预加载预设字典 —— 让 traits computed 在 TraitsTab 挂载前也能用预设基线
  // 兜底(用户首次进编辑器但 store.presets 还没被 TraitsTab 加载的情况)。
  // 失败静默忽略:TraitsTab 自己也会加载一次。
  store.loadPresets().catch(() => {})
  // mount 时强制 reload —— 确保 store.activePresetType 反映后端最新状态,
  // 修复「跨页面导航后 personality 页不显示当前使用中的性格」bug
  await ensureLoaded(true)
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

/**
 * TraitsTab 最新 emit 的 modelValue(包含 presetType + 五维)。
 * 每次 TraitsTab 通过 update:modelValue 上报当前 preset 的最新值,
 * 保存时(onTraitsSave)直接用此值作为请求体,确保保存的就是用户当前看到/编辑的 preset。
 */
const pendingTraits = ref<OceanTraits | null>(null)

async function onTraitsUpdate(v: OceanTraits) {
  // TraitsTab 主动 emit 的当前展示 preset 的最新值(local 状态)。
  // 缓存下来供 onTraitsSave 使用,store.traits 列表由 saveTraits 维护。
  pendingTraits.value = { ...v }
  // 同步更新 activePresetType:TraitsTab emit modelValue 的同时意味着
  // 当前 preset 是用户最后选中的(无论是否已保存),切走后回填正确。
  activePresetType.value = v.presetType
}

/**
 * 用户在 TraitsTab 内部点击 chip 切换预设时触发(无需保存)。
 * 立即同步 activePresetType,使切走再回来 chip 仍保留用户当前选择。
 */
function onPresetChange(presetType: string) {
  activePresetType.value = presetType
}

async function onTraitsSave(silent?: boolean) {
  // 优先用 TraitsTab 缓存的当前 preset 值;若空,退到 props.modelValue
  const req = pendingTraits.value ?? traits.value
  if (!req) return
  try {
    const saved = await store.saveTraits(req)
    // 成功保存后用返回的最新行覆盖 pendingTraits
    pendingTraits.value = saved
    // 注意:保存 OCEAN 不再切换 active —— 后端职责拆分后,
    // 「保存五维性格配置」只写五维,「使用性格」是另一个独立动作
    // (走 store.setActivePreset,在 TraitsTab 的 onUsePreset 中调用)。
    // 这里不再写 activePresetType —— 维持当前 active 不变。
    // 但「当前预设」(本地编辑的 preset)要同步:
    // 用户在哪个 preset 上点保存,本地 activePresetType 应保留那个,
    // 切走再回来能看到自己最后编辑的 preset。
    activePresetType.value = saved.presetType
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

/**
 * 从空态的「使用默认预设」入口进来:
 *   往 store.traits 列表里塞一条「标准陪伴」占位记录(五维全 0),
 *   TraitsTab 会立即出现,用户可继续编辑后点保存入库存行。
 *   注意:仅占位,不直接写 DB;点"设置当前性格"才落库。
 */
function onCreateTraits() {
  if (!roleId.value) {
    ElMessage.warning('请先选择一个角色')
    return
  }
  // 仅在列表中还没有任何条目时初始化占位,避免重复添加
  if (store.traits.length === 0) {
    store.traits = [
      {
        roleId: roleId.value,
        openness: 0,
        conscientiousness: 0,
        extraversion: 0,
        agreeableness: 0,
        neuroticism: 0,
        presetType: 'companion_default',
      },
    ]
  }
  ElMessage.info('已套用默认预设,可在滑块上微调后点击「设置当前性格」入库')
}

/**
 * 从空态的「新建人格」入口进来:
 *   初始化一份空白人格塞进 store(roleId 已带上,savePersona 会自动 upsert),
 *   PersonaTab 会立即出现,用户填完点保存即落库。
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
  ElMessage.info('已为你创建空白人格,填写完成后点击「保存人格」即可入库')
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