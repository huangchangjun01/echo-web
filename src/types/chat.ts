/**
 * 聊天附件：SSE `resource` 事件归一化后的对象。
 *
 * 字段命名说明：
 *   - 后端协议是 snake_case（event_id / file_id / mime_type / total_chunks …）
 *   - 前端用 camelCase 别名（eventId / fileId / mimeType / totalChunks …）
 *   - name / displayName 同时保留：name 是原始 fileName（可能含路径），displayName 是 UI 标题
 *   - modality 决定渲染分支（image / audio / video / file）
 *   - url 后端**不带 scheme**，前端调用前必须用 @/api/chat.resolveUrl() 拼接
 *
 * 去重：前端按 fileId + chunkIndex 唯一标识一条资源（同一 fileId+chunkIndex 视为同一条）
 */
export interface ChatAttachment {
  /** React key / 流内去重 key（后端 event_id，无则用 fileId+chunkIndex 兜底） */
  id: string
  /** 原始 fileName（可能含路径） */
  name: string
  /** 清洗后的纯文件名（UI 标题 / 按钮文本 / download 属性） */
  displayName: string
  /** 不带 scheme 的 URL，前端必须 resolveUrl() 拼 https:// */
  url: string
  /** 对象存储 fileId（可作为点击行为埋点 key / 二次查询） */
  fileId?: string
  /** 渲染分支 */
  modality: 'image' | 'audio' | 'video' | 'file'
  /** MIME（按 metadata → URL 扩展名 → modality 兜底三级降级） */
  mimeType?: string
  /** 多 chunk 文本片段定位（图像通常为 0/1） */
  chunkIndex: number
  /** 总片数 */
  totalChunks: number
  /** 文件大小（KB / MB 显示） */
  sizeBytes?: number
  /** 0~1 相似度（调试用） */
  similarity?: number
  /** 触发源：l1_hint / search_memory / understand_image … */
  source?: string
  /** ReAct 迭代序号；l1_hint 时为 undefined */
  iter?: number
}

/** RAG / 检索上下文摘要（event=context）。
 *
 * 协议字段：
 *   - persona_len / l0_count / l1_count / l2_count：计数（l2_count 为扩展）
 *   - persona / l0_items / l1_items / l2_items：真实注入内容（方案 A 扩展）
 *
 * 实际内容只下发有限条数（persona 全部 / L0 最多 50 / L1 最多 100 / L2 最多 100），
 * 超出部分仅以计数展示，避免 SSE 帧过大。
 * l1_items / l2_items 由后端按 [L1]/[L2] 前缀拆分下发；老后端只下发混合 l1_items 时，
 * 前端按 [L2] 前缀拆分兜底。
 */
export interface ChatContextInfo {
  personaLen: number
  l0Count: number
  l1Count: number
  /** L2 会话摘要条数（父摘要） */
  l2Count?: number
  /** 人格原文（DEFAULT_PERSONA 或用户自定义人格），完整下发 */
  persona?: string
  /** L0 核心记忆条目（最多 50 条） */
  l0Items?: string[]
  /** L1 近期摘要条目（最多 100 条，仅 L1 子条目） */
  l1Items?: string[]
  /** L2 会话摘要条目（父摘要，最多 100 条） */
  l2Items?: string[]
}

/** 工具调用结果（event=tool）。
 *
 * 新协议 payload：{name, iter, ok, summary}。
 * 不再带 args / result 原文，只给 ≤200 字摘要。
 */
export interface ChatToolCall {
  /** 工具名（如 'search_memory' / 'understand_image'） */
  name: string
  /** ReAct 第几轮（0 起） */
  iter: number
  /** 调用是否成功 */
  ok: boolean
  /** 结果摘要（≤200 字，仅供调试 / UI 状态展示） */
  summary: string
}

/** 长期记忆抽取结果（event=memory_extracted）。
 *
 * 新协议 payload：{ok, error?}。仅 stream=false 时出现；前端用它做 toast 反馈。
 */
export interface ChatMemoryResult {
  ok: boolean
  error?: string
}

/** 流式思考过程（event=thinking）。
 *
 * 后端在以下阶段各自 yield 一条 thinking 事件，让前端能实时看到「AI 在干什么」：
 *   - stage=intent          → 意图识别完成
 *   - stage=context_build   → 构建人格 / L0 / L1 上下文
 *   - stage=recall_search   → 回忆检索进行中
 *   - stage=react_decision  → ReAct 工具决策中
 *   - stage=cascade         → 进入大小模型级联生成
 *
 * 文本 ≤ 256 字，仅供前端折叠面板展示，不进入正文。
 */
export interface ChatThinkingEvent {
  stage: 'intent' | 'context_build' | 'recall_search' | 'react_decision' | 'cascade' | string
  text: string
}

/** 回忆检索命中详情（event=memory_recall）。
 *
 * 与 context（仅给计数）不同，本事件携带每条命中的 memoryId / topic / summary / similarity，
 * 前端可在折叠面板中向用户展示「我翻到了哪些相关回忆」。
 */
export interface ChatRecallHit {
  memoryId: string
  topic: string
  summary: string
  similarity: number
}

/** 回忆检索结果（event=memory_recall）。 */
export interface ChatMemoryRecall {
  count: number
  hits: ChatRecallHit[]
}

/**
 * M2:三桶心情实时更新事件。
 * 由 echo-ai biz/chat.py 在每轮 done 事件前下发( |delta|>0.15 时)。
 */
export interface ChatMoodUpdate {
  instantVal: number          // 即时心情 value [-1, 1]
  instantIntensity: number    // 即时强度 [0, 1]
  instantEmotion: string      // 即时情绪标签
  shortVal: number            // 短期心情 value
  baselineVal: number         // 基线心情 value
  /** 表情映射:smile/happy/excited/sad/cry/angry/concern/thinking */
  expression: string
  /** 本轮 user_msg 的 valence(用于 PixelCharacter 色调联动) */
  valence: number
}

/**
 * 流式阶段名（SSE `stage` 事件 v2 协议）。
 *
 * 阶段顺序约定:intent → recall_search → tool_dispatch → model_reasoning → answer。
 * 业务可能跳过某些阶段(例如不需要工具时跳过 tool_dispatch)。
 */
export type StageName =
  | 'intent'
  | 'recall_search'
  | 'tool_dispatch'
  | 'model_reasoning'
  | 'answer'

/** 阶段状态机:idle/running/done/skipped。 */
export type StageState = 'idle' | 'running' | 'done' | 'skipped'

/** SSE `stage` 事件:每个阶段 start/end 各 yield 一条。 */
export interface StageEvent {
  name: StageName
  state: 'start' | 'end'
  ts_ms: number
}

/** SSE `emotion_change` 事件:情绪标签变化时下发。 */
export interface EmotionChange {
  from: string
  to: string
  intensity: number
  reason?: string
}

/** SSE `relation_change` 事件:关系值变化时下发。 */
export interface RelationChange {
  intimacy_delta: number
  trust_delta: number
  satisfaction_delta: number
  source: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 单图字段：兼容老协议 imageUrl 一来一去；多资源请走 attachments */
  imageUrl?: string
  /** 附件资源（event=resource 累积），按 modality 决定渲染分支 */
  attachments?: ChatAttachment[]
  /** 工具调用列表（event=tool 累积） */
  toolCalls?: ChatToolCall[]
  /** RAG / 检索上下文摘要（event=context 累积），调试用 */
  context?: ChatContextInfo
  /** 长期记忆抽取结果（event=memory_extracted），仅 toast 提示 */
  memoryResult?: ChatMemoryResult
  /** 思考过程事件流（event=thinking 累积），按时间顺序展示 */
  thinkings?: ChatThinkingEvent[]
  /** 回忆检索命中详情（event=memory_recall 累积） */
  memoryRecall?: ChatMemoryRecall
  /**
   * 阶段状态机（v2 协议）。
   * 由 SSE `stage` 事件累加得到,用于 StageProgress 组件展示五阶段进展。
   * key 为 StageName,value 为该阶段的最新 StageState。
   */
  stageState?: Record<StageName, StageState>
  /** 消息来源：text = 键盘输入，voice = 语音识别；默认 text */
  source?: 'text' | 'voice'
  createdAt: number
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface ChatRequest {
  model: string
  userId: string
  sessionId: string
  /**
   * 角色 ID；用于在 Python 端按角色隔离记忆检索与生成。
   * 未传时后端默认填 'default'，避免破坏老调用。
   */
  roleId?: string
  messages?: Pick<Message, 'role' | 'content'>[]
  message?: string
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface ChatResponse {
  id: string
  choices: {
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}