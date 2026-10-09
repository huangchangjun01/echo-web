import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
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
import {
  listSessionMessages as apiListMessages,
  submitFeedback as apiSubmitFeedback,
  type ChatSessionMessageItem,
} from '@/api/session'
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
  /** 单会话模型:全局只存在一条会话(按 (user, role) 锁定),sessions[0] 即当前会话 */
  const isStreaming = ref(false)
  const selectedModel = ref(DEFAULT_MODEL)
  const userId = ref(getUserId())
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
  /** 当前正在打字机/流式输出的 assistant 消息 id。
   *  - 用于 StreamingBubble 的 isStreaming 判定
   *  - 必须放在 store 里才能让 :is-streaming 绑定生效（v2 UI 修复）
   *
   * 单角色单会话产品模型下：全局只有一条流，`setStreamingMessageId` 不再需要
   * sessionId 参数（之前为了「流式隔离到具体 session」存在的，现在不必要了）。
   */
  const streamingMessageId = ref<string | null>(null)

  /**
   * 实际发送到后端的 sessionId（auth session）。
   *  - 登录后 = authStore.sessionId（与后端 /api/auth/login 返回值严格一致）
   *  - 未登录 = 退回到 IP 派生的 anonymous sessionId
   *
   * 与 chat_messages 的 session_id 不是一回事 —— 后者是 ``sessionIdFor(userId, roleId)``
   * 的确定性哈希,由 ChatPage 算出并随 /chat 请求透传。
   */
  const sessionId = ref<string>(loadPersistedChatSessionId())

  /** 当前会话 —— 单会话模型下恒为 sessions[0](因为 (user, role) 唯一)
   *  - 加载历史前:可能为 null
   *  - 加载历史后:必有一行 ChatSession */
  const currentSession = computed(() => sessions.value[0] ?? null)

  async function initDefaultSession() {
    if (sessionId.value) return
    let sid = localStorage.getItem('default_session_id')
    if (!sid) {
      try {
        const res = (await getClientIP()) as unknown as { ip?: string }
        sid = `ip_${(res?.ip || 'unknown').replace(/\./g, '_')}`
        localStorage.setItem('default_session_id', sid)
      } catch {
        sid = `ip_default`
        localStorage.setItem('default_session_id', sid)
      }
    }
    sessionId.value = sid
    persistChatSessionId(sid)
  }

  /**
   * 把外部（通常是 authStore）提供的 authSessionId 同步到 chatStore.sessionId。
   */
  function syncSessionId(authSessionId: string) {
    const next = (authSessionId || '').trim()
    sessionId.value = next
    persistChatSessionId(next)
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
   * - 提供 messageId 时,同时把状态写入到对应 Message.stageState,
   *   让 StageProgress 能按消息维度读取(而不是只读到全局 map)
   */
  function setStageState(name: StageName, state: StageState, messageId?: string | null) {
    stageState.value[name] = state
    if (state === 'running') currentStage.value = name
    if (messageId) {
      // 全局查 messageId:单会话模型下,只有一条流一条会话,
      // 但消息可能跨多个会话角色(切角色会重建消息列表),
      // 用全 sessions 兜底,O(n*m) 完全可接受。
      let msg: Message | undefined
      for (const s of sessions.value) {
        msg = s.messages.find((m) => m.id === messageId)
        if (msg) break
      }
      if (msg) {
        if (!msg.stageState) msg.stageState = { ...DEFAULT_STAGE_STATE }
        msg.stageState[name] = state
      }
    }
  }

  /**
   * 设置当前正在流式输出的 assistant 消息 id。
   *
   * 单会话模型下:`id == null` 表示流结束,`id != null` 表示该消息正在打字机输出。
   * 不再需要第二个 sessionId 参数 —— 全局只有一条流。
   */
  function setStreamingMessageId(id: string | null) {
    streamingMessageId.value = id
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

  /**
   * 用户对某条 assistant 消息点赞/踩。
   * - 前端乐观更新（UI 立刻变色）
   * - 调后端 submitFeedback；失败时回滚并提示
   * - 不阻塞 UI：fetch 错误统一回滚
   */
  async function rateMessage(
    sessionId: string,
    messageId: string,
    rating: 1 | -1 | 0,
  ): Promise<void> {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const msg = session.messages.find((m) => m.id === messageId)
    if (!msg) return
    const prev = msg.rating ?? null
    // 乐观更新：再点一次相同 rating → 取消（0）；不同 rating → 覆盖
    let next: number
    if (rating === 0) {
      next = 0
    } else if (prev === rating) {
      next = 0
    } else {
      next = rating
    }
    msg.rating = next
    try {
      const resp = await apiSubmitFeedback({ sessionId, messageId, rating: next as 1 | -1 | 0 })
      if (!resp.ok) throw new Error(resp.error || 'feedback failed')
    } catch (e) {
      msg.rating = prev
      throw e
    }
  }

  /**
   * 把刚刚 addMessage 的本地消息刷新 msgCount / loadedCount（侧栏已下线，不再写 title）。
   * 仅在加载过历史的会话上做,避免污染未 hydrate 的会话。
   */
  function bumpSessionOnMessage(sessionId: string): void {
    const local = sessions.value.find((s) => s.id === sessionId)
    if (!local) return
    const newMsgCount = local.messages.length
    local.msgCount = newMsgCount
    local.loadedCount = local.messages.length
  }

  // 监听 authStore 变化：登录态切换时自动同步 sessionId + userId
  //
  // 关键修复:``localSessionId = sessionIdFor(userId, roleId)`` 必须用与后端
  // chat_sessions.user_id / chat_messages.user_id 完全一致的 id:
  //   - 已登录时 = authStore.currentUser.id(数字字符串,如 '63'),后端 echo-core
  //     中间件会把它注入 body.userId 写到 chat_messages.user_id
  //   - 未登录时 = localStorage 'chat_user_id'(nanoid,匿名持久化)
  //
  // 如果只用 nanoid、不跟着 auth 切,登录后 deterministic session_id 算出来的是
  // sha256('nanoid:role'),与 DB 里 sha256('63:role') 不一致 → list_messages
  // 查 0 条。
  const authStore = useAuthStore()
  watch(
    () => authStore.sessionId,
    (sid) => syncSessionId(sid),
    { immediate: true },
  )
  watch(
    () => authStore.currentUser?.id,
    (uid) => {
      if (uid === null || uid === undefined) return
      // 把数字 id 转成字符串,与后端 row.user_id(VARCHAR)对齐
      userId.value = String(uid)
    },
    { immediate: true },
  )

  return {
    sessions,
    isStreaming,
    selectedModel,
    userId,
    sessionId,
    currentSession,
    initDefaultSession,
    syncSessionId,
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
    stageState,
    currentStage,
    liveMood,
    liveEmotion,
    liveRelation,
    streamingMessageId,
    setStageState,
    resetStageState,
    setLiveMood,
    setLiveEmotion,
    setLiveRelation,
    setStreamingMessageId,
    rateMessage,
    bumpSessionOnMessage,
  }
})

/**
 * 给工具调用生成稳定的去重 key：name + iter + summary 三元组。
 * 新协议没有 args / result，只用摘要做签名。
 */
function stableKeyOfToolCall(tc: ChatToolCall): string {
  return [tc.name, tc.iter, tc.summary].join('|')
}

/**
 * 把后端 list_messages 输出转成前端 Message。
 * - role 强制收敛到 user/assistant
 * - createdAt 用 number ms
 * - content 归一化策略:
 *     • \n\n+ 折成 \n\n（段落分隔由 ChatMarkdown 的 <br> 渲染成空行）
 *     • 字间 / 句间的孤立 \n 折成空格（旧 STT、老代码路径、句间意外换行）
 *     • 首尾空白 trim 掉
 *   新消息的流式路径不走此函数,LLM 输出原样保留 —— 历史加载和实时流式
 *   两边对 \n 的处理对齐到"段落折行 / 句间同段"的同一语义。
 *
 * 导出为顶层函数,供 ChatPage 在加载历史 / 切角色时复用。
 */
export function messageItemToMessage(item: ChatSessionMessageItem): Message {
  // 历史 assistant 消息没有从 DB 带回 stageState（后端 list_messages 协议不带这个字段）。
  // 但 StreamingBubble 用 `v-if="hasAnyStageActivity"` 控制 StageProgress 的渲染,
  // 不补 stageState 会让 5 个阶段胶囊在历史消息里整体消失。
  // 关键：不能把所有阶段都填 'done' —— 流式时某些阶段可能跳过（比如 chat 意图
  // 不调用工具就跳过 tool_dispatch），如果历史也填 done 会多出一个错误的【工具】绿色胶囊。
  // 这里按 trace 实际数据推断：只有真正发生过的阶段标 'done'，其余保持 'idle'
  // （StageProgress 不会渲染 idle 状态的胶囊）。
  const isAssistant = item.role !== 'user'
  const trace = item.trace ?? undefined
  const stageState = isAssistant
    ? {
        intent: 'done' as const,
        // recall_search：trace.memoryRecall 存在即视为发生过
        recall_search: trace?.memoryRecall ? ('done' as const) : ('idle' as const),
        // tool_dispatch：trace.toolCalls 非空才算发生过；空数组/未定义都视为跳过
        tool_dispatch: trace?.toolCalls?.length
          ? ('done' as const)
          : ('idle' as const),
        model_reasoning: 'done' as const,
        answer: 'done' as const,
      }
    : undefined

  // 阶段明细（trace）：新消息后端已随消息落库（思考 / 工具调用 / 回忆命中 / 上下文注入），
  // 这里映射回 Message —— 历史消息的「胶囊」popover 就能展示该轮的工具与记忆调用情况；
  // 老消息没有 trace → 只保留全 done 的 stageState，popover 回落到"未保存原始数据"占位。
  // 注：trace 已在上面 stageState 计算时声明,这里复用。

  return {
    id: item.messageId,
    role: item.role === 'user' ? 'user' : 'assistant',
    content: normalizeHistoricalContent(item.content || ''),
    source: item.source === 'voice' ? 'voice' : 'text',
    rating: typeof item.rating === 'number' ? item.rating : null,
    createdAt: Date.parse(item.createdAt) || Date.now(),
    stageState,
    thinkings: trace?.thinkings?.length ? trace.thinkings : undefined,
    toolCalls: trace?.toolCalls?.length ? trace.toolCalls : undefined,
    memoryRecall: trace?.memoryRecall,
    context: trace?.context,
    memoryResult: trace?.memoryResult,
  }
}

/**
 * 历史 content 归一化:
 *   "第一段\n\n第二段"           → "第一段\n\n第二段"   段落保留
 *   "第一段\n\n\n第二段"         → "第一段\n\n第二段"   多折行折成段落
 *   "哈\n哈"                    → "哈 哈"             字间孤立 \n → 空格
 *   "你好。\n今天天气真好。"      → "你好。 今天天气真好。"  句间 \n → 空格
 *   "\n\n  哈哈哈  \n\n"         → "哈哈哈"             首尾 trim
 *
 * 实现要点:用 lookbehind/lookahead 在一遍扫描里精准识别"被非空白夹住的
 * 孤立 \n"(\n\n 的两个 \n 各自有相邻的 \n,前后断言都不通过,自然不会被
 * 折成空格)。`\n{3,}` 先折成段落分隔,避免连续多个 \n 被断言误判。
 */
function normalizeHistoricalContent(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n') // 3+ \n 折叠成段落分隔
    .replace(/(?<=\S)\n(?=\S)/g, ' ') // 孤立 \n(前后都是非空白)→ 空格
    .trim()
}

// 兼容保留 — ChatPage 不再引用,但别的模块可能用到
export const __unused_listSessionMessages = apiListMessages