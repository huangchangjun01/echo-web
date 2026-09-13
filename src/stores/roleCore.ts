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
  const traits = ref<OceanTraits | null>(null)
  const coreSnapshot = ref<CoreSnapshot | null>(null)
  // OCEAN 预设字典(用户级,companion_default 不可删)
  const presets = ref<OceanPreset[]>([])
  const presetsLoaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const bootstrapped = ref(false)

  // ----- getters -----
  const hasPersona = computed(() => persona.value !== null)
  const hasTraits = computed(() => traits.value !== null)

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

  async function loadTraits(roleId: number): Promise<OceanTraits | null> {
    loading.value = true
    try {
      const t = await getTraits(roleId)
      traits.value = t
      setCurrentRoleId(roleId)
      return t
    } finally {
      loading.value = false
    }
  }

  async function loadAll(roleId: number): Promise<void> {
    loading.value = true
    try {
      // 三类数据并行拉:persona + traits 进各自 ref,coreSnapshot 进 ref(含 beliefs/relationship/mood)
      // 切角色时必须三件套同时刷新,否则 BeliefsTab 等子页面会显示上一角色的脏数据。
      const [p, t, snap] = await Promise.all([
        getPersona(roleId),
        getTraits(roleId),
        loadCoreSnapshot(roleId).catch(() => null),
      ])
      persona.value = p
      traits.value = t
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

  async function saveTraits(req: OceanTraits): Promise<OceanTraits> {
    saving.value = true
    try {
      const saved = await saveTraitsApi(req)
      traits.value = saved
      setCurrentRoleId(req.roleId)
      if (!saved) throw new Error('OCEAN 保存返回为空')
      return saved
    } finally {
      saving.value = false
    }
  }

  /**
   * 切换预设：把 OCEAN 五维填为预设基线（不立即保存，需用户确认）。
   */
  function applyPresetLocally(presetType: PresetType) {
    const baselines: Record<PresetType, Omit<OceanTraits, 'roleId' | 'updatedAt'>> = {
      companion_default: {
        openness: 0.4,
        conscientiousness: -0.1,
        extraversion: 0.2,
        agreeableness: 0.7,
        neuroticism: -0.4,
        presetType: 'companion_default',
      },
      rational_advisor: {
        openness: 0.2,
        conscientiousness: 0.7,
        extraversion: -0.3,
        agreeableness: 0.2,
        neuroticism: -0.5,
        presetType: 'rational_advisor',
      },
      energetic_girl: {
        openness: 0.6,
        conscientiousness: -0.3,
        extraversion: 0.8,
        agreeableness: 0.6,
        neuroticism: -0.6,
        presetType: 'energetic_girl',
      },
      gentle_senior: {
        openness: 0.3,
        conscientiousness: 0.4,
        extraversion: 0.1,
        agreeableness: 0.6,
        neuroticism: -0.3,
        presetType: 'gentle_senior',
      },
      sarcastic_friend: {
        openness: 0.5,
        conscientiousness: -0.2,
        extraversion: 0.4,
        agreeableness: -0.2,
        neuroticism: -0.1,
        presetType: 'sarcastic_friend',
      },
      psych_counselor: {
        openness: 0.7,
        conscientiousness: 0.6,
        extraversion: 0,
        agreeableness: 0.9,
        neuroticism: -0.7,
        presetType: 'psych_counselor',
      },
    }
    const baseline = baselines[presetType]
    if (!traits.value) {
      traits.value = {
        ...baseline,
        roleId: currentRoleId.value ?? 0,
      }
    } else {
      traits.value = {
        ...traits.value,
        openness: baseline.openness,
        conscientiousness: baseline.conscientiousness,
        extraversion: baseline.extraversion,
        agreeableness: baseline.agreeableness,
        neuroticism: baseline.neuroticism,
        presetType,
      }
    }
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
        // 顺手刷新 persona/traits 缓存
        if (snap.persona) persona.value = snap.persona
        if (snap.traits) traits.value = snap.traits
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
    traits.value = null
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
    // 当前 traits 的 presetType 仍指向同一 key,但其 OCEAN 值已变:
    // 同步本地 traits 的五维,避免 UI 显示与预设不一致
    if (traits.value && traits.value.presetType === updated.key) {
      traits.value = {
        ...traits.value,
        openness: updated.openness,
        conscientiousness: updated.conscientiousness,
        extraversion: updated.extraversion,
        agreeableness: updated.agreeableness,
        neuroticism: updated.neuroticism,
      }
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
    coreSnapshot,
    presets,
    presetsLoaded,
    loading,
    saving,
    bootstrapped,
    // getters
    hasPersona,
    hasTraits,
    // actions
    bootstrap,
    setCurrentRoleId,
    loadPersona,
    loadTraits,
    loadAll,
    savePersona,
    saveTraits,
    applyPresetLocally,
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