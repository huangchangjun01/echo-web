/**
 * Role Core 类型定义（PRD 02_PRD_data_model.md）。
 *
 * 命名约定：camelCase 与后端字段 snake_case 一一对应，在 api/roleCore.ts 的
 * unwrap<>() 处完成转换。前端一律使用 camelCase。
 */

export type PresetType =
  | 'companion_default'
  | 'rational_advisor'
  | 'energetic_girl'
  | 'gentle_senior'
  | 'sarcastic_friend'
  | 'psych_counselor'

export const PRESET_OPTIONS: { value: PresetType; label: string; description: string }[] = [
  { value: 'companion_default', label: '标准陪伴', description: '温暖、亲和、低神经质' },
  { value: 'rational_advisor', label: '理性顾问', description: '逻辑清晰、克制情绪' },
  { value: 'energetic_girl', label: '元气少女', description: '活力充沛、乐观开朗' },
  { value: 'gentle_senior', label: '温柔学长', description: '稳重体贴、温和有礼' },
  { value: 'sarcastic_friend', label: '毒舌损友', description: '直率犀利、敢说实话' },
  { value: 'psych_counselor', label: '心理咨询师', description: '倾听共情、专业支持' },
]

/**
 * 示例对话：user 提问 → assistant 应答
 */
export interface ExampleDialog {
  user: string
  assistant: string
}

/**
 * 结构化人格
 */
export interface RolePersona {
  userId?: number
  roleId: number
  identity: string
  background: string
  traitsTags: string[]
  values: string[]
  speakingStyle: string
  taboos: string[]
  exampleDialogs: ExampleDialog[]
  version?: number
  createdAt?: string
  updatedAt?: string
}

/**
 * OCEAN 五维性格：五维 ∈ [-1, 1]
 *
 * maxDelta/warning:后端在保存时计算 5 维最大单步变更。
 * 当 maxDelta > 0.05(原硬上限)时,后端不再拒绝,而是填 warning 让前端弹窗提示。
 * 用户主动切换预设的大变更属于正常业务行为,不应被拦截。
 */
export interface OceanTraits {
  userId?: number
  roleId: number
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
  presetType: PresetType
  updatedAt?: string
  maxDelta?: number
  warning?: string
}

/**
 * OCEAN 预设条目（后端 /role-core/presets 返回的结构）。
 *
 * isProtected=true 表示标准陪伴等系统级预设：仅允许修改数值/标签,不允许删除。
 * key 由前端生成（小写字母/数字/_/-，1~64），作为 OCEAN traits 写入时的 presetType 标识符。
 */
export interface OceanPreset {
  id: number
  userId: number
  key: string
  label: string
  description: string
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
  isProtected: boolean
  createdAt?: string
  updatedAt?: string
}

/** 新增预设请求体 */
export interface CreatePresetReq {
  key: string
  label: string
  description?: string
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}

/** 修改信念请求体(topic/stance/confidence/source 全部可改) */
export interface UpdateBeliefReq {
  topic: string
  stance: string
  confidence: number
  source?: string
}

/** 修改预设请求体(key/isProtected 不可改) */
export interface UpdatePresetReq {
  label: string
  description?: string
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}

/**
 * 三桶心情快照（M2 占位）
 */
export interface MoodSnapshot {
  instantVal: number
  instantIntensity: number
  instantEmotion: string
  shortVal: number
  shortIntensity: number
  shortEmotion: string
  baselineVal: number
  baselineIntensity: number
  baselineEmotion: string
}

/**
 * 三维关系值（M3 占位）
 */
export interface RelationshipSnapshot {
  intimacy: number
  trust: number
  satisfaction: number
  coDays: number
}

/**
 * 信念条目（M3 占位）
 */
export interface BeliefItem {
  id: number
  topic: string
  stance: string
  confidence: number
  evidenceCount: number
  source: string
  userConfirmed: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 完整 Role Core 快照（调试面板用）
 */
export interface CoreSnapshot {
  persona?: RolePersona
  traits?: OceanTraits
  mood?: MoodSnapshot
  relationship?: RelationshipSnapshot
  beliefs?: BeliefItem[]
}

/**
 * 反馈评分 5 档（M7 占位）
 */
export type FeedbackRating = -2 | -1 | 0 | 1 | 2

/**
 * 演化建议（M6 占位）
 */
export type SuggestionTargetType = 'persona' | 'traits' | 'belief' | 'mood'
export type SuggestionStatus = 'pending' | 'applied' | 'skipped' | 'edited'
export type SuggestionSource = 'memory_extract' | 'feedback' | 'user_request'

export interface SuggestionItem {
  id: number
  userId: number
  roleId: number
  targetType: SuggestionTargetType
  suggestionJson: string
  status: string
  source: string
  confidence: number
  reason: string
  createdAt: string
  resolvedAt?: string
}