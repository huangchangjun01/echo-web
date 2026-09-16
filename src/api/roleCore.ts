/**
 * Role Core API 协议层（echo-core /role-core/*）。
 *
 * 遵循项目规范（参考 src/api/memory.ts）：每个端点单独导出函数 + Envelope<T> + unwrap<T>()。
 * 错误统一抛 Error(env.message)，由 src/api/index.ts 的 axios 拦截器 toast 展示。
 *
 * 重要：axios 拦截器已经返回 `response.data`（即 Envelope），所以这里直接对返回值 unwrap，
 * 不再调用 `.data`（否则会把 envelope 当作具体业务对象传给 unwrap，触发"请求失败"）。
 *
 * 「资源不存在」语义：后端在 /role-core/persona 与 /role-core/traits 未填写时
 * 返回 HTTP 200 + data:null（属于正常业务态），前端 unwrap 直接得到 null，
 * 不再走 validateStatus 404 hack / 错误消息匹配等脆弱路径。
 */

import type {
  BeliefItem,
  CoreSnapshot,
  CreatePresetReq,
  OceanPreset,
  OceanTraits,
  RelationshipSnapshot,
  RolePersona,
  SuggestionItem,
  TraitsListResponse,
  UpdateBeliefReq,
  UpdatePresetReq,
} from '@/types/roleCore'
import request from './index'

// ==================== Envelope + unwrap ====================

interface Envelope<T> {
  code: number
  message: string
  data: T
}

/** 解开 Envelope。axios 拦截器已返回 response.data(即 Envelope),直接传入。 */
function unwrap<T>(env: Envelope<T> | null | undefined): T | null {
  if (!env) return null
  if (env.code === 200 || env.code === 0) {
    return (env.data ?? null) as T | null
  }
  throw new Error(env.message ?? '请求失败')
}

/** 强制将 axios 响应转为 Envelope(TS 类型与运行时不一致的桥接)。 */
function asEnvelope<T>(v: unknown): Envelope<T> {
  return v as Envelope<T>
}

// ==================== Persona ====================

export async function savePersona(req: RolePersona): Promise<RolePersona | null> {
  const env = asEnvelope<RolePersona>(
    await request.post('/role-core/persona', req),
  )
  return unwrap<RolePersona>(env)
}

/**
 * 取人格。未填写时后端返回 HTTP 200 + data:null，本函数返回 null，
 * 由调用方（store / page）按空态 UI 提示用户新建人格。
 */
export async function getPersona(roleId: number): Promise<RolePersona | null> {
  const env = asEnvelope<RolePersona>(
    await request.get('/role-core/persona', { params: { roleId } }),
  )
  return unwrap<RolePersona>(env)
}

// ==================== OCEAN Traits ====================

export async function saveTraits(req: OceanTraits): Promise<OceanTraits | null> {
  const env = asEnvelope<OceanTraits>(
    await request.post('/role-core/traits', req),
  )
  return unwrap<OceanTraits>(env)
}

/**
 * 取 OCEAN 五维 + 当前生效预设(按预设隔离的列表)。
 *
 * 返回 TraitsListResponse{list, activePresetType}:
 *   - list: 当前 (user, role) 下所有已保存预设的 OCEAN 五维(每个 preset 一条)
 *   - activePresetType: 当前真正生效的预设 key(决定 chat 回复时读的 OCEAN)
 *
 * 失败兜底:返回空 list + 默认 activePresetType('companion_default'),
 * 让前端按空态 UI 提示用户初始化。
 *
 * 历史演进:
 *   - 曾返回单条 OceanTraits → 切换预设时值互窜的 bug
 *   - 改为返回 OceanTraits[] → 修复,但没有「当前使用」概念
 *   - 改为返回 TraitsListResponse → 增加 active preset 跟踪
 */
export async function getTraits(roleId: number): Promise<TraitsListResponse> {
  const env = asEnvelope<TraitsListResponse>(
    await request.get('/role-core/traits', { params: { roleId } }),
  )
  const data = unwrap<TraitsListResponse>(env)
  return data ?? { list: [], activePresetType: 'companion_default' }
}

/**
 * 切换当前使用的 OCEAN 预设(POST /api/role-core/active-preset)。
 *
 * 与 saveTraits 的职责拆分:
 *   - saveTraits:写入某预设的 OCEAN 五维值(可能改得很细)
 *   - setActivePreset:仅切换 chat 回复时读哪个 preset,不写 OCEAN
 *
 * 前端对应「保存五维性格配置」+「使用性格」两个独立按钮。
 *
 * 失败(由 axios 拦截器 toast):
 *   - 400: 参数错误或 presetType 不存在
 *   - 500: 后端写库失败
 */
export async function setActivePreset(
  roleId: number,
  presetType: string,
): Promise<string> {
  const env = asEnvelope<{ activePresetType: string }>(
    await request.post('/role-core/active-preset', { roleId, presetType }),
  )
  const data = unwrap<{ activePresetType: string }>(env)
  return data?.activePresetType ?? presetType
}

// ==================== Core Snapshot（调试面板用）====================

export async function getCoreSnapshot(roleId: number): Promise<CoreSnapshot | null> {
  const env = asEnvelope<CoreSnapshot>(
    await request.get('/role-core/core', { params: { roleId } }),
  )
  return unwrap<CoreSnapshot>(env)
}

// ==================== Mood（M2）====================

export async function getMood(roleId: number): Promise<import('@/types/roleCore').MoodSnapshot | null> {
  const env = asEnvelope<import('@/types/roleCore').MoodSnapshot>(
    await request.get('/role-core/mood', { params: { roleId } }),
  )
  return unwrap<import('@/types/roleCore').MoodSnapshot>(env)
}

// ==================== Relationship（M3）====================

export async function getRelationship(roleId: number): Promise<RelationshipSnapshot | null> {
  const env = asEnvelope<RelationshipSnapshot>(
    await request.get('/role-core/relationship', { params: { roleId } }),
  )
  return unwrap<RelationshipSnapshot>(env)
}

// ==================== Belief（M3）====================

export async function listBeliefs(roleId: number): Promise<BeliefItem[] | null> {
  const env = asEnvelope<BeliefItem[]>(
    await request.get('/role-core/beliefs', { params: { roleId } }),
  )
  return unwrap<BeliefItem[]>(env) ?? []
}

export interface CreateBeliefReq {
  roleId: number
  topic: string
  stance: string
  confidence: number
  source?: string
}

export async function createBelief(req: CreateBeliefReq): Promise<BeliefItem | null> {
  const env = asEnvelope<BeliefItem>(
    await request.post('/role-core/beliefs', req),
  )
  return unwrap<BeliefItem>(env)
}

export async function deleteBelief(id: number): Promise<void> {
  const env = asEnvelope<null>(
    await request.delete(`/role-core/beliefs/${id}`),
  )
  unwrap(env)
}

/** 修改信念(topic/stance/confidence/source 全部可改) */
export async function updateBelief(id: number, req: UpdateBeliefReq): Promise<BeliefItem | null> {
  const env = asEnvelope<BeliefItem>(
    await request.put(`/role-core/beliefs/${id}`, req),
  )
  return unwrap<BeliefItem>(env)
}

// ==================== Suggestion（M6）====================

export async function listPendingSuggestions(roleId: number): Promise<SuggestionItem[] | null> {
  const env = asEnvelope<SuggestionItem[]>(
    await request.get('/role-core/suggestions', { params: { roleId } }),
  )
  return unwrap<SuggestionItem[]>(env) ?? []
}

export async function resolveSuggestion(
  id: number,
  action: 'apply' | 'skip' | 'edit',
  editedJson?: string,
): Promise<void> {
  const env = asEnvelope<null>(
    await request.post(`/role-core/suggestions/${id}/${action}`, { editedJson }),
  )
  unwrap(env)
}

// ==================== Feedback（M7）====================

export interface SubmitFeedbackReq {
  roleId: number
  messageId: string
  rating: -2 | -1 | 0 | 1 | 2
  comment?: string
}

export async function submitFeedback(req: SubmitFeedbackReq): Promise<void> {
  const env = asEnvelope<null>(
    await request.post('/role-core/feedback', req),
  )
  unwrap(env)
}

// ==================== OCEAN 预设字典 ====================

/**
 * 列出某 (user, role) 的所有预设。后端在首次访问时自动种子默认 6 个。
 *
 * 角色隔离后必须传 roleId —— 预设按 (user, role) 隔离,不同角色看到的
 * 预设字典可能完全不同。
 */
export async function listPresets(roleId: number): Promise<OceanPreset[]> {
  const env = asEnvelope<OceanPreset[]>(
    await request.get('/role-core/presets', { params: { roleId } }),
  )
  return unwrap<OceanPreset[]>(env) ?? []
}

/** 新增预设。Key 由前端生成(小写字母/数字/_/-)。req 中必带 roleId。 */
export async function createPreset(req: CreatePresetReq): Promise<OceanPreset | null> {
  const env = asEnvelope<OceanPreset>(
    await request.post('/role-core/presets', req),
  )
  return unwrap<OceanPreset>(env)
}

/** 修改预设(label/description/OCEAN)。Key 与 isProtected 不可改。req 中必带 roleId。 */
export async function updatePreset(id: number, req: UpdatePresetReq): Promise<OceanPreset | null> {
  const env = asEnvelope<OceanPreset>(
    await request.put(`/role-core/presets/${id}`, req),
  )
  return unwrap<OceanPreset>(env)
}

/** 删除预设。isProtected=true 的预设会被后端拒绝(400)。roleId 必传 —— 路径或 query。 */
export async function deletePreset(id: number, roleId: number): Promise<void> {
  const env = asEnvelope<null>(
    await request.delete(`/role-core/presets/${id}`, { params: { roleId } }),
  )
  unwrap(env)
}