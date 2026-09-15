/**
 * Role Core Pinia store。
 *
 * 职责：
 *   1. 缓存当前编辑的 roleId 的 persona / traits
 *   2. 提供 fetchPersona / savePersona / fetchTraits / saveTraits / fetchCoreSnapshot
 *   3. bootstrap：从 localStorage 读取上次的 roleId，恢复编辑上下文
 *
 * 风格遵循 src/stores/auth.ts / src/stores/roles.ts。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  BeliefItem,
  CoreSnapshot,
  CreatePresetReq,
  OceanPreset,
  OceanTraits,
  PresetType,
  RolePersona,
  UpdateBeliefReq,
  UpdatePresetReq,
} from '@/types/roleCore'
import {
  createBelief,
  createPreset as createPresetApi,
  deleteBelief as deleteBeliefApi,
  deletePreset as deletePresetApi,
  getCoreSnapshot,
  getPersona,
  getTraits,
  listPresets as listPresetsApi,
  savePersona as savePersonaApi,
  saveTraits as saveTraitsApi,
  setActivePreset as setActivePresetApi,
  updateBelief as updateBeliefApi,
  updatePreset as updatePresetApi,
} from '@/api/roleCore'

// In-flight 请求缓存:同一 roleId 并发请求合并为同一个 Promise,避免重复网络往返
const inflightCoreSnapshots = new Map<number, Promise<CoreSnapshot | null>>()
const STORAGE_ROLE_ID = 'echo_role_core_role_id'

export const useRoleCoreStore = defineStore('roleCore', () => {
  // ----- state -----
  const currentRoleId = ref<number | null>(null)
  const persona = ref<RolePersona | null>(null)
  /**
   * 当前 (user, role) 下所有已保存预设的 OCEAN 列表(每个预设一条)。
   * 切预设保存互不影响——后端为每个 preset 独立存行。
   */
  const traits = ref<OceanTraits[]>([])
  /**
   * 当前真正生效的预设 key(决定 chat 回复时读的 OCEAN)。
   *
   * 历史:曾没有这个字段,UI 上的"当前预设"完全由 store.traits 列表推断,
   * 与 chat 实际使用的 personality_bias 不同步。修复:后端在 SaveTraits 时
   * 把被保存的 preset 自动设为 active,并通过 GET /role-core/traits 返回。
   * UI 在 chip 上显示"使用中"标记 + 在预设区下方显示"当前使用: xxx"。
   */
  const activePresetType = ref<string>('companion_default')
  const coreSnapshot = ref<CoreSnapshot | null>(null)
  // OCEAN 预设字典(用户级,companion_default 不可删)
  const presets = ref<OceanPreset[]>([])
  const presetsLoaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const bootstrapped = ref(false)

  // ----- getters -----
  const hasPersona = computed(() => persona.value !== null)
  const hasTraits = computed(() => traits.value.length > 0)

  /**
   * 按 presetType 查已保存的 OCEAN;找不到返回 null(前端应回退到预设基线)。
   */
  function findTraitsByPreset(presetType: string): OceanTraits | null {
    return traits.value.find((t) => t.presetType === presetType) ?? null
  }

  /**
   * 当前 active preset 对应的 OCEAN 行(如果存在)。
   * 不存在时返回 null(通常意味着该 preset 还没被保存过,UI 应展示基线)。
   */
  const findActiveTraits = computed<OceanTraits | null>(() =>
    traits.value.find((t) => t.presetType === activePresetType.value) ?? null,
  )

  // ----- actions -----
  function setCurrentRoleId(roleId: number | null) {
    currentRoleId.value = roleId
    if (roleId !== null) {
      try {
        localStorage.setItem(STORAGE_ROLE_ID, String(roleId))
      } catch {
        // localStorage 不可用时静默忽略
      }
    } else {
      try {
        localStorage.removeItem(STORAGE_ROLE_ID)
      } catch {
        // ignore
      }
    }
  }

  /** bootstrap：从 localStorage 恢复上次的 roleId */
  function bootstrap(): number | null {
    if (bootstrapped.value) return currentRoleId.value
    try {
      const stored = localStorage.getItem(STORAGE_ROLE_ID)
      if (stored) {
        const id = Number(stored)
        if (Number.isFinite(id) && id > 0) {
          currentRoleId.value = id
        }
      }
    } catch {
      // ignore
    }
    bootstrapped.value = true
    return currentRoleId.value
  }

  async function loadPersona(roleId: number): Promise<RolePersona | null> {
    loading.value = true
    try {
      const p = await getPersona(roleId)
      persona.value = p
      setCurrentRoleId(roleId)
      return p
    } finally {
      loading.value = false
    }
  }

  async function loadTraits(roleId: number): Promise<OceanTraits[]> {
    loading.value = true
    try {
      const resp = await getTraits(roleId)
      traits.value = resp.list
      // 同步 active preset(后端权威)
      if (resp.activePresetType) {
        activePresetType.value = resp.activePresetType
      }
      setCurrentRoleId(roleId)
      return resp.list
    } finally {
      loading.value = false
    }
  }

  async function loadAll(roleId: number): Promise<void> {
    loading.value = true
    try {
      // 三类数据并行拉:persona + traits 进各自 ref,coreSnapshot 进 ref(含 beliefs/relationship/mood)
      // 切角色时必须三件套同时刷新,否则 BeliefsTab 等子页面会显示上一角色的脏数据。
      const [p, traitsResp, snap] = await Promise.all([
        getPersona(roleId),
        getTraits(roleId),
        loadCoreSnapshot(roleId).catch(() => null),
      ])
      persona.value = p
      traits.value = traitsResp.list
      if (traitsResp.activePresetType) {
        activePresetType.value = traitsResp.activePresetType
      }
      if (snap !== null) {
        coreSnapshot.value = snap
      } else {
        // 拉取失败兜底置空,避免后续 tab 看到旧 role 的 beliefs
        coreSnapshot.value = { beliefs: [] }
      }
      setCurrentRoleId(roleId)
    } finally {
      loading.value = false
    }
  }

  async function savePersona(req: RolePersona): Promise<RolePersona> {
    saving.value = true
    try {
      const saved = await savePersonaApi(req)
      persona.value = saved
      setCurrentRoleId(req.roleId)
      if (!saved) throw new Error('人格保存返回为空')
      return saved
    } finally {
      saving.value = false
    }
  }

  /**
   * 保存 OCEAN(单条预设)。
   * 用保存响应的 preset 替换/插入到 traits 列表,保持列表按 preset 独立。
   *
   * 注意:保存 OCEAN 不再切换 active —— 后端职责拆分后,「保存五维性格配置」
   * 只写五维值,「使用性格」是另一个独立动作(走 setActivePreset)。
   * 这样用户在不改 OCEAN 的情况下也能切换当前使用的预设。
   */
  async function saveTraits(req: OceanTraits): Promise<OceanTraits> {
    saving.value = true
    try {
      const saved = await saveTraitsApi(req)
      if (!saved) throw new Error('OCEAN 保存返回为空')
      // 替换/插入到列表(每个 preset 独立)
      const idx = traits.value.findIndex((t) => t.presetType === saved.presetType)
      if (idx >= 0) {
        traits.value = [
          ...traits.value.slice(0, idx),
          saved,
          ...traits.value.slice(idx + 1),
        ]
      } else {
        traits.value = [...traits.value, saved]
      }
      setCurrentRoleId(req.roleId)
      return saved
    } finally {
      saving.value = false
    }
  }

  /**
   * 切换当前使用的 OCEAN 预设(不动 OCEAN 五维)。
   *
   * 后端 upsert role_active_preset 并回写新 activePresetType —— 同步本地
   * state 让 UI 上 chip 的"使用中"标记立即反映。
   *
   * 与 saveTraits 的区别:
   *   - saveTraits:落库 OCEAN 五维(可能改得很细)
   *   - setActivePreset:仅切 active,不改 OCEAN
   */
  async function setActivePreset(roleId: number, presetType: string): Promise<string> {
    saving.value = true
    try {
      const active = await setActivePresetApi(roleId, presetType)
      activePresetType.value = active
      setCurrentRoleId(roleId)
      return active
    } finally {
      saving.value = false
    }
  }

  /**
   * 切换预设:在列表中查找已保存的 OCEAN。
   *
   * 历史上曾直接覆写 store.traits(单值),导致切预设保存时丢失旧预设的自定义值。
   * 修复:不再覆写 traits 列表 — 列表就是权威数据源,切换只是「展示哪个 preset」。
   * 调用方应根据返回的 saved 自行同步本地 sliders。
   */
  function findPreset(presetType: PresetType): OceanTraits | null {
    return traits.value.find((t) => t.presetType === presetType) ?? null
  }

  async function loadCoreSnapshot(roleId: number): Promise<CoreSnapshot | null> {
    // 同 roleId 并发请求去重:共用同一个 Promise,避免 BeliefsTab/RelationshipTab 同时挂载时重复请求
    const inflight = inflightCoreSnapshots.get(roleId)
    if (inflight) return inflight

    const p = (async () => {
      loading.value = true
      try {
        const snap = await getCoreSnapshot(roleId)
        if (!snap) {
          coreSnapshot.value = null
          return null
        }
        coreSnapshot.value = snap
        // 顺手刷新 persona 缓存(snap.traits 是后端选的主预设,不直接覆盖全量列表)
        if (snap.persona) persona.value = snap.persona
        setCurrentRoleId(roleId)
        return snap
      } finally {
        inflightCoreSnapshots.delete(roleId)
        loading.value = false
      }
    })()
    inflightCoreSnapshots.set(roleId, p)
    return p
  }

  /** 重置当前角色的编辑上下文（切换角色时调用） */
  function reset(): void {
    persona.value = null
    traits.value = []
    coreSnapshot.value = null
    currentRoleId.value = null
  }

  /** M3 占位：信念 CRUD 透传 */
  async function addBelief(req: Parameters<typeof createBelief>[0]): Promise<BeliefItem> {
    const item = await createBelief(req)
    if (!item) throw new Error('信念创建失败')
    if (coreSnapshot.value) {
      coreSnapshot.value = {
        ...coreSnapshot.value,
        beliefs: [item, ...(coreSnapshot.value.beliefs ?? [])],
      }
    }
    return item
  }

  async function removeBelief(id: number): Promise<void> {
    await deleteBeliefApi(id)
    if (coreSnapshot.value?.beliefs) {
      coreSnapshot.value = {
        ...coreSnapshot.value,
        beliefs: coreSnapshot.value.beliefs.filter((b) => b.id !== id),
      }
    }
  }

  /** 修改信念:在 coreSnapshot.beliefs 中就地替换该项 */
  async function updateBelief(id: number, req: UpdateBeliefReq): Promise<BeliefItem> {
    const item = await updateBeliefApi(id, req)
    if (!item) throw new Error('修改信念失败')
    if (coreSnapshot.value?.beliefs) {
      coreSnapshot.value = {
        ...coreSnapshot.value,
        beliefs: coreSnapshot.value.beliefs.map((b) => (b.id === id ? item : b)),
      }
    }
    return item
  }

  // ===== OCEAN 预设字典 CRUD =====

  /**
   * 拉取当前用户的预设列表。后端首次访问会种子默认 6 个。
   * 同 roleId 并发请求去重,避免重复网络往返(类似 loadCoreSnapshot)。
   */
  async function loadPresets(force = false): Promise<OceanPreset[]> {
    if (presetsLoaded.value && !force && presets.value.length > 0) {
      return presets.value
    }
    const list = await listPresetsApi()
    presets.value = list
    presetsLoaded.value = true
    return list
  }

  async function createPreset(req: CreatePresetReq): Promise<OceanPreset> {
    const created = await createPresetApi(req)
    if (!created) throw new Error('新增预设失败')
    presets.value = [...presets.value, created].sort((a, b) => a.id - b.id)
    return created
  }

  async function updatePreset(id: number, req: UpdatePresetReq): Promise<OceanPreset> {
    const updated = await updatePresetApi(id, req)
    if (!updated) throw new Error('修改预设失败')
    presets.value = presets.value.map((p) => (p.id === id ? updated : p))
    // 若该预设当前已有 OCEAN 记录(用户曾保存过),同步更新其五维以与预设基线一致
    const idx = traits.value.findIndex((t) => t.presetType === updated.key)
    if (idx >= 0) {
      traits.value = [
        ...traits.value.slice(0, idx),
        {
          ...traits.value[idx],
          openness: updated.openness,
          conscientiousness: updated.conscientiousness,
          extraversion: updated.extraversion,
          agreeableness: updated.agreeableness,
          neuroticism: updated.neuroticism,
        },
        ...traits.value.slice(idx + 1),
      ]
    }
    return updated
  }

  async function removePreset(id: number): Promise<void> {
    await deletePresetApi(id)
    presets.value = presets.value.filter((p) => p.id !== id)
  }

  return {
    // state
    currentRoleId,
    persona,
    traits,
    activePresetType,
    coreSnapshot,
    presets,
    presetsLoaded,
    loading,
    saving,
    bootstrapped,
    // getters
    hasPersona,
    hasTraits,
    findTraitsByPreset,
    findActiveTraits,
    // actions
    bootstrap,
    setCurrentRoleId,
    loadPersona,
    loadTraits,
    loadAll,
    savePersona,
    saveTraits,
    setActivePreset,
    findPreset,
    loadCoreSnapshot,
    reset,
    addBelief,
    removeBelief,
    updateBelief,
    loadPresets,
    createPreset,
    updatePreset,
    removePreset,
  }
})