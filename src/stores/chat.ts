import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { nanoid } from 'nanoid'
import type {
  ChatAttachment,
  ChatContextInfo,
  ChatMemoryRecall,
  ChatMemoryResult,
  ChatMoodUpdate,
  ChatSession,
  ChatThinkingEvent,
  ChatToolCall,
  EmotionChange,
  Message,
  RelationChange,
  StageName,
  StageState,
} from '@/types/chat'
import { getClientIP } from '@/api/chat'
import { useAuthStore } from '@/stores/auth'

const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_CHAT_MODEL || 'gpt-4o'

/** 兜底 stage 状态：所有阶段都 idle，供 resetStageState 与首屏默认值使用 */
export const DEFAULT_STAGE_STATE: Record<StageName, StageState> = {
  intent: 'idle',
  recall_search: 'idle',
  tool_dispatch: 'idle',
  model_reasoning: 'idle',
  answer: 'idle',
}

/** 持久化 key：当前登录用户在 chat 维度的 sessionId。
 *  - 已登录时 == authStore.sessionId（与后端登录返回值一致）
 *  - 未登录时退回 IP 派生值，保证匿名用户也能用 */
const STORAGE_KEY_CHAT_SESSION = 'chat_wire_session_id'

/** 从 localStorage 同步一份 chat 维度的 sessionId（首屏用，避免闪烁） */
function loadPersistedChatSessionId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_CHAT_SESSION) || ''
  } catch {
    return ''
  }
}

function persistChatSessionId(value: string) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY_CHAT_SESSION, value)
    else localStorage.removeItem(STORAGE_KEY_CHAT_SESSION)
  } catch {
    /* ignore */
  }
}

function getUserId(): string {
  let userId = localStorage.getItem('chat_user_id')
  if (!userId) {
    userId = nanoid()
    localStorage.setItem('chat_user_id', userId)
  }
  return userId
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const isStreaming = ref(false)
  const selectedModel = ref(DEFAULT_MODEL)
  const userId = ref(getUserId())
  const defaultSessionId = ref<string | null>(null)
  /** M2: 当前角色的心情快照（前端 PixelCharacter 联动） */
  const currentMood = ref<ChatMoodUpdate | null>(null)
  /** M2: 当前对话角色的关系值（intimacy 进度条用） */
  const currentIntimacy = ref<number>(0)
  /** M3: 五阶段状态机（驱动 StageProgress 进度条） */
  const stageState = ref<Record<StageName, StageState>>({ ...DEFAULT_STAGE_STATE })
  /** M3: 当前正在运行的阶段（用于 in-flight 高亮） */
  const currentStage = ref<StageName | null>(null)
  /** M3: 流式心情快照（v2 SSE 帧，区别于 M2 全局 currentMood） */
  const liveMood = ref<ChatMoodUpdate | null>(null)
  /** M3: 流式情绪变化帧（v2 SSE emotion_change） */
  const liveEmotion = ref<EmotionChange | null>(null)
  /** M3: 流式关系值变化帧（v2 SSE relation_change） */
  const liveRelation = ref<RelationChange | null>(null)

  /**
   * 实际发送到后端的 sessionId。
   *  - 登录后 = authStore.sessionId（与后端 /api/auth/login 返回值严格一致）
   *  - 未登录 = 退回到 IP 派生的 anonymous sessionId
   */
  const sessionId = ref<string>(loadPersistedChatSessionId())

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
  )

  async function initDefaultSession() {
    if (defaultSessionId.value) return
    let sessionId = localStorage.getItem('default_session_id')
    if (!sessionId) {
      try {
        const res = (await getClientIP()) as unknown as { ip?: string }
        sessionId = `ip_${(res?.ip || 'unknown').replace(/\./g, '_')}`
        localStorage.setItem('default_session_id', sessionId)
      } catch {
        sessionId = `ip_default`
        localStorage.setItem('default_session_id', sessionId)
      }
    }
    defaultSessionId.value = sessionId
  }

  /**
   * 把外部（通常是 authStore）提供的 authSessionId 同步到 chatStore.sessionId。
   */
  function syncSessionId(authSessionId: string) {
    const next = (authSessionId || '').trim()
    sessionId.value = next
    persistChatSessionId(next)
  }

  function ensureAnonymousSession() {
    if (sessionId.value) return
    if (defaultSessionId.value) {
      sessionId.value = defaultSessionId.value
      persistChatSessionId(defaultSessionId.value)
    }
  }

  function createSession(): ChatSession {
    const session: ChatSession = {
      id: nanoid(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    return session
  }

  function deleteSession(id: string) {
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1) sessions.value.splice(idx, 1)
    if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value[0]?.id ?? null
    }
  }

  function addMessage(sessionId: string, message: Omit<Message, 'id' | 'createdAt'>): Message {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) throw new Error('Session not found')

    const newMsg: Message = {
      ...message,
      id: nanoid(),
      createdAt: Date.now(),
    }
    session.messages.push(newMsg)
    session.updatedAt = Date.now()

    if (session.messages.length === 1 && message.role === 'user') {
      session.title = message.content.slice(0, 30) || '新对话'
    }

    return newMsg
  }

  function appendToLastAssistantMessage(sessionId: string, content: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (last && last.role === 'assistant') {
      last.content += content
      session.updatedAt = Date.now()
    }
  }

  function setMessageImageUrl(sessionId: string, imageUrl: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (last && last.role === 'assistant') {
      last.imageUrl = imageUrl
      session.updatedAt = Date.now()
    }
  }

  /**
   * 追加单条资源到指定会话最后一条 assistant 消息。
   * 去重键：fileId + chunkIndex（同一资源的多次召回会被合并，保留最新一条）。
   * 没有 fileId 时退回到 eventId / id。
   */
  function appendMessageResource(sessionId: string, resource: ChatAttachment) {
    if (!resource) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    const existing = last.attachments ?? []
    const keyOf = (a: ChatAttachment) =>
      `${a.fileId ?? a.id}#${a.chunkIndex ?? 0}`
    const newKey = keyOf(resource)
    const idx = existing.findIndex((a) => keyOf(a) === newKey)
    let merged: ChatAttachment[]
    if (idx >= 0) {
      merged = existing.slice()
      merged[idx] = resource
    } else {
      merged = [...existing, resource]
    }
    last.attachments = merged
    session.updatedAt = Date.now()
  }

  /**
   * 把一批附件追加到指定会话最后一条 assistant 消息上。
   * - 走 appendMessageResource 同样的去重策略（fileId+chunkIndex）
   * - 历史会话里没有最后一条 assistant 消息时静默丢弃
   */
  function appendMessageAttachments(sessionId: string, attachments: ChatAttachment[]) {
    if (!attachments?.length) return
    for (const att of attachments) appendMessageResource(sessionId, att)
  }

  /**
   * 追加工具调用记录到指定会话最后一条 assistant 消息。
   * 去重键：(name, iter, summary) 三元组，避免同一次工具调用被多次回放时重复插入。
   */
  function appendMessageToolCalls(sessionId: string, toolCalls: ChatToolCall[]) {
    if (!toolCalls?.length) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    const existing = last.toolCalls ?? []
    const seen = new Set(existing.map((t) => stableKeyOfToolCall(t)))
    const merged = [...existing]
    for (const tc of toolCalls) {
      if (!tc) continue
      const key = stableKeyOfToolCall(tc)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(tc)
    }
    last.toolCalls = merged
    session.updatedAt = Date.now()
  }

  /**
   * 记录 RAG / 检索上下文摘要到指定会话最后一条 assistant 消息。
   * 新协议只给 persona / core / l1 三个计数，每次都覆盖（后端也只会发一次）。
   */
  function appendMessageContext(sessionId: string, info: ChatContextInfo) {
    if (!info) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    last.context = info
    session.updatedAt = Date.now()
  }

  /**
   * 记录长期记忆抽取结果到指定会话最后一条 assistant 消息。
   * 覆盖式写入（一次响应通常只有一次 memory_extracted 帧）。
   */
  function appendMessageMemoryResult(sessionId: string, result: ChatMemoryResult) {
    if (!result) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    last.memoryResult = result
    session.updatedAt = Date.now()
  }

  /**
   * 追加一条思考过程事件到指定会话最后一条 assistant 消息。
   * - 多次触发会按时间顺序累积（前端展示时折叠按阶段分组）
   * - stage 重复时只在第一次出现时记入，避免阶段重复触发刷屏
   */
  function appendMessageThinking(sessionId: string, ev: ChatThinkingEvent) {
    if (!ev?.text) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    const list = last.thinkings ?? []
    // model_reasoning 是流式逐 chunk 下发的多帧（同一 stage），需增量拼接成完整一段；
    // 离散 stage（intent/context_build/recall_search/react_decision/cascade）每轮只发一帧，
    // 合并后仍为一条，保持"同 stage 去重、防重连刷屏"的语义。
    const idx = list.findIndex((t) => t.stage === ev.stage)
    if (idx >= 0) {
      const merged = [...list]
      merged[idx] = { ...merged[idx], text: (merged[idx].text ?? '') + (ev.text ?? '') }
      last.thinkings = merged
    } else {
      last.thinkings = [...list, { stage: ev.stage, text: ev.text }]
    }
    session.updatedAt = Date.now()
  }

  /**
   * 记录回忆检索命中详情到指定会话最后一条 assistant 消息。
   * 覆盖式写入（一次响应通常只有一次 memory_recall 帧）。
   */
  function appendMessageMemoryRecall(sessionId: string, info: ChatMemoryRecall) {
    if (!info) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    last.memoryRecall = info
    session.updatedAt = Date.now()
  }

  /**
   * M2:更新当前角色的心情快照（全局,不绑定 session）。
   * 收到 mood_update SSE 帧时调用,驱动 PixelCharacter 表情联动。
   */
  function updateMood(mood: ChatMoodUpdate | null) {
    if (mood === null) {
      currentMood.value = null
      return
    }
    currentMood.value = mood
  }

  /**
   * M3:更新某阶段的运行状态(SSE `stage` 帧)。
   * - state='running' 时同步记录 currentStage
   * - state='done' / 'skipped' / 'idle' 只更新状态映射,不修改 currentStage
   */
  function setStageState(name: StageName, state: StageState) {
    stageState.value[name] = state
    if (state === 'running') currentStage.value = name
  }

  /**
   * M3:重置阶段状态机(新一轮流式开始前调用)。
   * - stageState 回到全部 idle
   * - currentStage 清空
   */
  function resetStageState() {
    stageState.value = { ...DEFAULT_STAGE_STATE }
    currentStage.value = null
  }

  /**
   * M3:写入流式心情快照(SSE `mood_update` v2 帧)。
   * 与 M2 `currentMood` 的区别:这里存的是增量帧,供 StageProgress 内嵌心情联动使用。
   */
  function setLiveMood(m: ChatMoodUpdate) {
    liveMood.value = m
  }

  /**
   * M3:写入流式情绪变化帧(SSE `emotion_change`)。
   */
  function setLiveEmotion(e: EmotionChange) {
    liveEmotion.value = e
  }

  /**
   * M3:写入流式关系值变化帧(SSE `relation_change`)。
   */
  function setLiveRelation(r: RelationChange) {
    liveRelation.value = r
  }

  function clearSession(sessionId: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      session.messages = []
      session.updatedAt = Date.now()
    }
  }

  // 监听 authStore 变化：登录态切换时自动同步 sessionId
  const authStore = useAuthStore()
  watch(
    () => authStore.sessionId,
    (sid) => syncSessionId(sid),
    { immediate: true },
  )

  return {
    sessions,
    currentSessionId,
    isStreaming,
    selectedModel,
    userId,
    defaultSessionId,
    sessionId,
    currentSession,
    initDefaultSession,
    syncSessionId,
    ensureAnonymousSession,
    createSession,
    deleteSession,
    addMessage,
    appendToLastAssistantMessage,
    setMessageImageUrl,
    appendMessageResource,
    appendMessageAttachments,
    appendMessageToolCalls,
    appendMessageContext,
    appendMessageMemoryResult,
    appendMessageThinking,
    appendMessageMemoryRecall,
    currentMood,
    currentIntimacy,
    updateMood,
    clearSession,
    stageState,
    currentStage,
    liveMood,
    liveEmotion,
    liveRelation,
    setStageState,
    resetStageState,
    setLiveMood,
    setLiveEmotion,
    setLiveRelation,
  }
})

/**
 * 给工具调用生成稳定的去重 key：name + iter + summary 三元组。
 * 新协议没有 args / result，只用摘要做签名。
 */
function stableKeyOfToolCall(tc: ChatToolCall): string {
  return [tc.name, tc.iter, tc.summary].join('|')
}