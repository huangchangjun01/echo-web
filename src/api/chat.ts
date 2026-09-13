/**
 * 对话 API 模块：Echo-AI 流式对话接口 `POST /chat` 的前端消费层。
 *
 * 协议格式（详见后端规范 v1）：
 *   - 每条 SSE 帧只有一行 `data: {"type": "...", ...}`，**不带** `event:` 行
 *   - 事件类型（按 `type` 字段分发）：
 *       context          → RAG / 检索上下文摘要（{persona_len, l0_count, l1_count} + 方案 A 扩展 {persona, l0_items, l1_items}）
 *       resource         → 附件（图片/音频/视频/文件），可多次，按 file_id+chunk_index 去重
 *       tool             → 工具调用结果（{name, iter, ok, summary}）
 *       presence         → 装饰性即时回应（{text}，方案A：首字到达前的心跳，不进 final_text）
 *       delta            → 小模型流式正文增量（{text}，必须 append）
 *       done             → 整轮结束（{full} 已含完整文本与"附件：" markdown 段落）
 *       memory_extracted → 长期记忆抽取（{ok} 或 {ok:false, error}），仅 stream=false 时出现
 *       thinking         → 流式思考过程（{stage, text}），让前端能看到"AI 在干什么"
 *       memory_recall    → 回忆检索命中详情（{count, hits:[{memory_id, topic, summary, similarity}]}）
 *       （旧 `prefix` 事件已随级联下线，前端保留 onPrefix 兼容处理）
 *   - 资源 URL **不带 scheme**（后端正则清掉 http/https/ //），前端必须调 resolveUrl() 拼接
 *
 * 关键实现：
 *   - 残缺帧（跨 chunk 边界）由 makeSseBuffer 攒齐 \n\n 后再 parseSseEvent
 *   - 解析后只看 `data.type`，不再依赖 frame.event（协议里根本没有 event: 行）
 *   - 所有 callback 都是 optional，未订阅的不会抛错
 */

import request from './index'
import type {
  ChatAttachment,
  ChatContextInfo,
  ChatMemoryRecall,
  ChatMemoryResult,
  ChatRequest,
  ChatResponse,
  ChatThinkingEvent,
  ChatToolCall,
} from '@/types/chat'

/** SSE 帧（解析后的最小单元） */
interface SseFrame {
  /** event 名（默认 message）。新协议不会带 event: 行，这里恒为 'message'，仅作占位 */
  event: string
  /** data 行（去前缀，多行用 \n 拼接） */
  data: string
}

/** 简易 SSE 行缓冲：把跨 chunk 的 `data: ...` 攒齐再交给 parseSseFrame */
function makeSseBuffer() {
  let buffer = ''
  return {
    push(chunk: string): SseFrame[] {
      buffer += chunk
      const out: SseFrame[] = []
      let sepIndex = findEventSeparator(buffer)
      while (sepIndex !== -1) {
        const sepLen = separatorLength(buffer, sepIndex)
        const event = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + sepLen)
        const frame = parseSseEvent(event)
        if (frame) out.push(frame)
        sepIndex = findEventSeparator(buffer)
      }
      return out
    },
    flush(): SseFrame[] {
      if (!buffer.trim()) {
        buffer = ''
        return []
      }
      const event = buffer
      buffer = ''
      const frame = parseSseEvent(event)
      return frame ? [frame] : []
    },
  }
}

/** 在 buffer 中找 SSE 事件分隔符（\n\n 的等价物） */
function findEventSeparator(buf: string): number {
  const i1 = buf.indexOf('\n\n')
  if (i1 !== -1) return i1
  const i2 = buf.indexOf('\r\n\r\n')
  if (i2 !== -1) return i2
  const i3 = buf.indexOf('\n\r\n')
  if (i3 !== -1) return i3
  return buf.indexOf('\r\n\n')
}

function separatorLength(buf: string, idx: number): number {
  if (buf.startsWith('\n\n', idx)) return 2
  if (buf.startsWith('\r\n\r\n', idx)) return 4
  if (buf.startsWith('\n\r\n', idx)) return 3
  if (buf.startsWith('\r\n\n', idx)) return 3
  return 2
}

/** 把一段 SSE event 文本解析成一个 {event,data} 帧 */
function parseSseEvent(eventText: string): SseFrame | null {
  let eventName = 'message'
  const dataLines: string[] = []
  for (const rawLine of eventText.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || line.startsWith(':')) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx)
    let value = line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value || 'message'
    else if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  return { event: eventName, data: dataLines.join('\n') }
}

/** 尝试把 data 解析成 JSON，失败时回退 null（不抛错） */
function safeJsonParse(data: string): Record<string, unknown> | null {
  const trimmed = data.trim()
  if (!trimmed || !trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/* ========================================================================
 * URL 处理：后端不带 scheme，前端必须自行拼接
 * ====================================================================== */

/**
 * 给后端返回的"裸 URL"补 scheme。
 *   - 已带 http/https → 原样返回
 *   - 以 // 开头（协议相对）→ 用当前页协议补齐（继续跟随页面协议）
 *   - 其他（裸域名）→ 默认拼 https://
 *
 * 关键决策：裸域名固定走 https:// 而不是 `window.location.protocol`，因为后端 CDN
 * 几乎都是 HTTPS-only；如果跟随页面协议，dev 环境（页面是 http://）会把图片解析成
 * http://，触发浏览器 mixed-content 拦截或 CDN 拒绝服务，导致图片预览功能彻底失
 * 效。协议相对 (`//cdn/...`) 这种"主动跟随页面协议"的写法保持原意，仍然跟随。
 *
 * 绝对不要让 `<img src="cdn.example.com/foo.jpg">` 落到浏览器解析为相对路径。
 */
export function resolveUrl(url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  // 协议相对：跟随当前页面协议（浏览器原生语义）
  if (url.startsWith('//')) return `${window.location.protocol}${url}`
  // 裸域名：默认 https://（CDN 资源通常 HTTPS；跟随 window.location.protocol 会
  // 导致 dev 页（http://localhost）把图解析成 http://，CDN 不接受 / 浏览器拦截）
  return `https://${url}`
}

/* ========================================================================
 * 帧归一化：把 {type, ...} 的 data 解析成强类型对象
 * ====================================================================== */

/** context 帧归一化：{persona_len, l0_count, l1_count} + 方案 A 扩展 {persona, l0_items, l1_items} */
function parseContextInfo(data: string): ChatContextInfo | null {
  const obj = safeJsonParse(data)
  if (!obj) return null
  const personaLen = typeof obj.persona_len === 'number' ? obj.persona_len : undefined
  const l0Count = typeof obj.l0_count === 'number' ? obj.l0_count : undefined
  const l1Count = typeof obj.l1_count === 'number' ? obj.l1_count : undefined
  // 三个字段都没有 → 视为无效帧
  if (personaLen === undefined && l0Count === undefined && l1Count === undefined) return null
  return {
    personaLen: personaLen ?? 0,
    l0Count: l0Count ?? 0,
    l1Count: l1Count ?? 0,
    persona: typeof obj.persona === 'string' ? obj.persona : undefined,
    l0Items: Array.isArray(obj.l0_items)
      ? (obj.l0_items.filter((x: unknown) => typeof x === 'string') as string[])
      : undefined,
    l1Items: Array.isArray(obj.l1_items)
      ? (obj.l1_items.filter((x: unknown) => typeof x === 'string') as string[])
      : undefined,
  }
}

/** tool 帧归一化：{name, iter, ok, summary} */
function parseToolCall(data: string): ChatToolCall | null {
  const obj = safeJsonParse(data)
  if (!obj) return null
  const name = typeof obj.name === 'string' ? obj.name : ''
  const iter = typeof obj.iter === 'number' ? obj.iter : 0
  const ok = obj.ok === true
  const summary = typeof obj.summary === 'string' ? obj.summary : ''
  if (!name && !summary) return null
  return { name: name || 'tool', iter, ok, summary }
}

/** resource 帧归一化：详见 types/chat.ts */
function parseResource(data: string): ChatAttachment | null {
  const obj = safeJsonParse(data)
  if (!obj) return null
  // 必填：url；其他字段（name / modality / mime_type …）可选
  const url = typeof obj.url === 'string' ? obj.url.trim() : ''
  if (!url) return null
  const name =
    (typeof obj.display_name === 'string' && obj.display_name.trim()) ||
    (typeof obj.name === 'string' && obj.name.trim()) ||
    url.split('/').pop() ||
    '附件'
  const modality = obj.modality === 'image' || obj.modality === 'audio' || obj.modality === 'video' || obj.modality === 'file'
    ? obj.modality
    : inferModalityFromMime(obj.mime_type)
  const mimeType = typeof obj.mime_type === 'string' ? obj.mime_type : undefined
  return {
    id: typeof obj.event_id === 'string' && obj.event_id
      ? obj.event_id
      : `${typeof obj.file_id === 'string' ? obj.file_id : url}#${obj.chunk_index ?? 0}`,
    name,
    displayName: typeof obj.display_name === 'string' ? obj.display_name : name,
    url,
    fileId: typeof obj.file_id === 'string' ? obj.file_id : undefined,
    modality,
    mimeType,
    chunkIndex: typeof obj.chunk_index === 'number' ? obj.chunk_index : 0,
    totalChunks: typeof obj.total_chunks === 'number' ? obj.total_chunks : 1,
    sizeBytes: typeof obj.size_bytes === 'number' ? obj.size_bytes : undefined,
    similarity: typeof obj.similarity === 'number' ? obj.similarity : undefined,
    source: typeof obj.source === 'string' ? obj.source : undefined,
    iter: typeof obj.iter === 'number' ? obj.iter : undefined,
  }
}

/** 按 mime_type 前缀兜底推断 modality */
function inferModalityFromMime(mime: unknown): ChatAttachment['modality'] {
  if (typeof mime !== 'string') return 'file'
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('video/')) return 'video'
  return 'file'
}

/** memory_extracted 帧归一化：{ok, error?} */
function parseMemoryResult(data: string): ChatMemoryResult | null {
  const obj = safeJsonParse(data)
  if (!obj) return null
  const ok = obj.ok === true
  const error = typeof obj.error === 'string' ? obj.error : undefined
  return { ok, error }
}

/** thinking 帧归一化：{stage, text}。stage 缺失时降级为 'unknown'。 */
function parseThinkingEvent(data: string): ChatThinkingEvent | null {
  const obj = safeJsonParse(data)
  if (!obj) return null
  const stage = typeof obj.stage === 'string' && obj.stage ? obj.stage : 'unknown'
  const text = typeof obj.text === 'string' ? obj.text : ''
  if (!text) return null
  return { stage, text }
}

/** memory_recall 帧归一化：{count, hits:[{memory_id, topic, summary, similarity}]} */
function parseMemoryRecall(data: string): ChatMemoryRecall | null {
  const obj = safeJsonParse(data)
  if (!obj) return null
  const count = typeof obj.count === 'number' ? obj.count : 0
  const rawHits = Array.isArray(obj.hits) ? obj.hits : []
  const hits = rawHits
    .map((h) => {
      if (!h || typeof h !== 'object') return null
      const o = h as Record<string, unknown>
      return {
        memoryId: typeof o.memory_id === 'string' ? o.memory_id : '',
        topic: typeof o.topic === 'string' ? o.topic : '',
        summary: typeof o.summary === 'string' ? o.summary : '',
        similarity: typeof o.similarity === 'number' ? o.similarity : 0,
      }
    })
    .filter((h): h is ChatMemoryRecall['hits'][number] => h !== null)
  return { count: count || hits.length, hits }
}

/** mood_update 帧归一化 */
function parseMoodUpdate(data: string): import('@/types/chat').ChatMoodUpdate | null {
  const obj = safeJsonParse(data)
  if (!obj) return null
  return {
    instantVal: typeof obj.instantVal === 'number' ? obj.instantVal : 0,
    instantIntensity: typeof obj.instantIntensity === 'number' ? obj.instantIntensity : 0,
    instantEmotion: typeof obj.instantEmotion === 'string' ? obj.instantEmotion : 'neutral',
    shortVal: typeof obj.shortVal === 'number' ? obj.shortVal : 0,
    baselineVal: typeof obj.baselineVal === 'number' ? obj.baselineVal : 0,
    expression: typeof obj.expression === 'string' ? obj.expression : 'neutral',
    valence: typeof obj.valence === 'number' ? obj.valence : 0,
  }
}

/** done 帧归一化：{full, sessionId} */
function parseDonePayload(data: string): { full?: string; sessionId?: string } {
  const obj = safeJsonParse(data)
  if (!obj) return {}
  return {
    full: typeof obj.full === 'string' ? obj.full : undefined,
    sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
  }
}

/** 取 {text} 字段，缺省返回 '' */
function extractText(obj: Record<string, unknown>): string {
  if (typeof obj.text === 'string' && obj.text) return obj.text
  if (typeof obj.content === 'string' && obj.content) return obj.content
  return ''
}

/* ========================================================================
 * HTTP 入口
 * ====================================================================== */

export function getClientIP(): Promise<string> {
  return request.get('/ip')
}

export function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  return request.post('/chat/completions', payload)
}

/**
 * SSE 流式对话：返回 AbortController，调用方可在需要时中止。
 *
 * options 形态（避免位置参数无限膨胀）：
 *   - onChunk:      每个 delta 增量片段（拼进 assistant 消息）
 *   - onPrefix:     旧级联小模型前缀（与 delta 走同一通道；已停用，保留兼容）
 *   - onPresence:   装饰性即时回应（{text}，方案A：首字到达前的心跳，不进 final_text）
 *   - onContext:    RAG / 检索上下文摘要（persona / L0 / L1 计数）
 *   - onTool:       工具调用结果（单条）
 *   - onResource:   附件资源（单条，按 file_id+chunk_index 去重由调用方负责）
 *   - onMemory:     长期记忆抽取结果（成功 / 失败 + error）
 *   - onThinking:   思考过程事件（{stage, text}，可多次）
 *   - onRecall:     回忆检索命中详情（{count, hits}）
 *   - onDone:       收到 done 帧；payload = {full?, sessionId?}
 *   - onError:      解析 / 网络错误（已忽略 AbortError）
 *
 * 任一 callback 缺省（undefined）都不会被调用，不抛错。
 */
export interface SendChatStreamOptions {
  onChunk?: (chunk: string) => void
  onPrefix?: (content: string) => void
  onPresence?: (content: string) => void
  onContext?: (info: ChatContextInfo) => void
  onTool?: (toolCall: ChatToolCall) => void
  onResource?: (resource: ChatAttachment) => void
  onMemory?: (info: ChatMemoryResult) => void
  onThinking?: (event: ChatThinkingEvent) => void
  onRecall?: (info: ChatMemoryRecall) => void
  onMoodUpdate?: (event: import('@/types/chat').ChatMoodUpdate) => void
  onDone?: (payload: { full?: string; sessionId?: string }) => void
  onError?: (error: Error) => void
}

export function sendChatMessageStream(
  payload: ChatRequest,
  options: SendChatStreamOptions = {},
): AbortController {
  // 注意：所有 callback 都通过 `options` 透传到 dispatchByType / handleFrame 的 wrap，
  // 这里不要再解构出单个变量，避免 noUnusedLocals 报错。
  const { onDone, onError } = options
  const controller = new AbortController()
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'
  const url = `${baseURL}/chat`
  const body = JSON.stringify({ ...payload, stream: true })

  console.info(
    '[sse] → POST %s, sessionId=%s (该值应等于后端 /api/auth/login 返回的 sessionId)',
    url,
    payload.sessionId,
  )

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body,
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { message?: string }).message || `请求失败 (${response.status})`
        throw new Error(message)
      }

      const contentType = response.headers.get('content-type') || ''
      // 非流式 JSON 兜底：stream=false 时一次性返回
      if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
        const data = await response.json()
        const events = (data as { events?: Array<Record<string, unknown>> }).events ?? []
        for (const ev of events) {
          dispatchByType(ev, options)
        }
        onDone?.({ full: (data as { full?: string }).full })
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        console.warn('[sse] response.body is null, treat as done')
        onDone?.({})
        return
      }
      const decoder = new TextDecoder('utf-8')
      const sse = makeSseBuffer()
      let receivedAny = false
      let frameCount = 0
      let finished = false

      const wrap: WrapHandlers = { ...options, markFinished: () => (finished = true) }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            const tail = sse.flush()
            frameCount += tail.length
            for (const f of tail) handleFrame(f, wrap, () => (receivedAny = true))
            break
          }
          const text = decoder.decode(value, { stream: true })
          if (text) {
            const frames = sse.push(text)
            frameCount += frames.length
            for (const f of frames) handleFrame(f, wrap, () => (receivedAny = true))
            if (finished) break
          }
        }
        console.info(
          '[sse] ← stream closed, receivedAny=%s, frames=%d, finished=%s',
          receivedAny,
          frameCount,
          finished,
        )
      } finally {
        try {
          reader.releaseLock()
        } catch {
          /* ignore */
        }
      }
      onDone?.({})
    })
    .catch((error) => {
      if (error?.name === 'AbortError') {
        console.info('[sse] aborted by caller')
        return
      }
      console.warn('[sse] error: %s', error?.message ?? String(error))
      onError?.(error instanceof Error ? error : new Error(String(error)))
    })

  return controller
}

/* ========================================================================
 * 单帧处理：只看 data.type 分发
 * ====================================================================== */

interface WrapHandlers extends SendChatStreamOptions {
  markFinished?: () => void
}

/**
 * 单帧处理：按 data.type 分发到对应 callback。
 *
 * 关键点：
 *   - delta 只读 text 字段，避免重复拼接
 *   - done 帧只用 full/sessionId，**不再**追加到文本（delta 已实时拼好）
 *   - resource 单条触发；去重在调用方（store）按 file_id+chunk_index 处理
 */
function handleFrame(
  frame: SseFrame,
  h: WrapHandlers,
  markReceived: () => void,
) {
  const data = frame.data.trim()
  if (!data) return
  markReceived()

  // OpenAI 风格 [DONE] 哨兵（向后兼容）
  if (data === '[DONE]') {
    h.markFinished?.()
    return
  }

  const obj = safeJsonParse(data)
  if (!obj) {
    // 非法 JSON 静默丢弃，避免把整段 data 当文本喷到 UI
    console.warn('[sse] ← non-JSON frame dropped: %s', data.slice(0, 80))
    return
  }

  const type = typeof obj.type === 'string' ? obj.type : ''

  switch (type) {
    case 'context': {
      const info = parseContextInfo(data)
      if (info) {
        console.info(
          '[sse] ← context, persona=%d, l0=%d, l1=%d, personaLen=%d, l0Items=%d, l1Items=%d',
          info.personaLen,
          info.l0Count,
          info.l1Count,
          info.persona?.length ?? 0,
          info.l0Items?.length ?? 0,
          info.l1Items?.length ?? 0,
        )
        h.onContext?.(info)
      }
      return
    }
    case 'resource': {
      const r = parseResource(data)
      if (r) {
        console.info(
          '[sse] ← resource, modality=%s, fileId=%s, chunk=%d/%d, name=%s',
          r.modality,
          r.fileId,
          r.chunkIndex,
          r.totalChunks,
          r.name,
        )
        h.onResource?.(r)
      } else {
        console.warn('[sse] ← resource frame missing url: %s', data.slice(0, 80))
      }
      return
    }
    case 'tool': {
      const tc = parseToolCall(data)
      if (tc) {
        console.info('[sse] ← tool, name=%s, iter=%d, ok=%s', tc.name, tc.iter, tc.ok)
        h.onTool?.(tc)
      }
      return
    }
    case 'prefix': {
      const text = extractText(obj)
      if (text) {
        console.info('[sse] ← prefix, len=%d', text.length)
        h.onPrefix?.(text)
      }
      return
    }
    case 'presence': {
      const text = extractText(obj)
      if (text) {
        console.info('[sse] ← presence, len=%d', text.length)
        h.onPresence?.(text)
      }
      return
    }
    case 'delta': {
      const text = extractText(obj)
      if (text) {
        h.onChunk?.(text)
      }
      return
    }
    case 'done': {
      const p = parseDonePayload(data)
      console.info(
        '[sse] ← done, fullLen=%d, sessionId=%s',
        p.full?.length ?? 0,
        p.sessionId ?? '',
      )
      // 调用方拿 full 做完整性校验；不再追加，避免与 delta 重复
      h.onDone?.(p)
      h.markFinished?.()
      return
    }
    case 'memory_extracted': {
      const m = parseMemoryResult(data)
      if (m) {
        console.info('[sse] ← memory_extracted, ok=%s', m.ok)
        h.onMemory?.(m)
      }
      return
    }
    case 'thinking': {
      const t = parseThinkingEvent(data)
      if (t) {
        console.info('[sse] ← thinking, stage=%s, text=%s', t.stage, t.text)
        h.onThinking?.(t)
      }
      return
    }
    case 'memory_recall': {
      const r = parseMemoryRecall(data)
      if (r) {
        console.info('[sse] ← memory_recall, count=%d', r.count)
        h.onRecall?.(r)
      }
      return
    }
    case 'mood_update': {
      // M2:三桶心情实时更新
      const m = parseMoodUpdate(data)
      if (m) {
        console.info(
          '[sse] ← mood_update, instant=%s, emotion=%s, expression=%s',
          m.instantVal?.toFixed(2) ?? '?',
          m.instantEmotion,
          m.expression,
        )
        h.onMoodUpdate?.(m)
      }
      return
    }
    default: {
      // 未知 type：静默丢弃（避免把整段 JSON 当文本喷到 UI）
      console.warn('[sse] ← unknown type=%s, dropped', type || '(empty)')
    }
  }
}

/** 非流式 JSON 响应里的 events[] 复用同款分发逻辑 */
function dispatchByType(ev: Record<string, unknown>, opts: SendChatStreamOptions) {
  const wrap: WrapHandlers = { ...opts }
  // 伪造一帧走 handleFrame（仅 data 字段）
  const frame: SseFrame = {
    event: 'message',
    data: JSON.stringify(ev),
  }
  handleFrame(frame, wrap, () => {})
}