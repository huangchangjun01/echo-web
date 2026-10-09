/**
 * 会话管理 API 模块（单角色单会话模型）。
 *
 * 协议（详见后端 routes/router.go chatSessionRegisterRoutes）：
 *   POST /api/chat/sessions/messages 拉取历史消息（支持 before 游标翻页；按 createdAt 升序）
 *   POST /api/chat/sessions/dates    聚合有消息的日期列表（按 date 倒序；日历视图用）
 *   POST /api/chat/feedback          点赞/踩反馈（影响 mood + traits）
 *
 * 单会话产品模型下，list / create / update / delete 全部下线 —— 前后端都没有
 * 「会话列表 / 新建 / 重命名 / 删除」概念。本文件只保留 messages + feedback。
 *
 * 设计要点：
 *   - before 游标对前端是不透明 token —— 只需把 nextBefore 原样回传即可，
 *     换分页策略不会破前端。
 *   - 点赞/踩写库后再异步触发 mood/traits，所以反馈请求本身非常快，
 *     不在前端做 loading 阻塞。
 */

import request from './index'
import type { ChatMessageTrace } from '@/types/chat'

/* ------------------------------------------------------------------ */
/* DTO                                                                 */
/* ------------------------------------------------------------------ */

/** 历史消息项（后端 list_messages 输出） */
export interface ChatSessionMessageItem {
  messageId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  source?: string
  rating?: number | null
  createdAt: string
  /** 阶段明细（assistant 轮次的思考/工具调用/回忆命中/上下文注入）；老消息为 null */
  trace?: ChatMessageTrace | null
}

/** 历史消息响应 */
export interface ChatSessionMessagesResult {
  ok: boolean
  items: ChatSessionMessageItem[]
  /** 翻页游标 —— 后端 JSON 字符串 `[id, ts]`,前端原样回传 */
  nextBefore?: string | null
  /** 向后翻页游标 —— 比当前已加载最新一条还新的下一页起点 */
  nextAfter?: string | null
  error?: string
}

/** 有消息的日期项（后端 list_message_dates 输出） */
export interface ChatSessionDateItem {
  /** YYYY-MM-DD 格式日期字符串 */
  date: string
  /** 当天消息条数 */
  count: number
}

/** 日期列表响应（按日期倒序） */
export interface ChatSessionDatesResult {
  ok: boolean
  dates: ChatSessionDateItem[]
  error?: string
}

/** 反馈响应 */
export interface ChatFeedbackResult {
  ok: boolean
  rating?: number
  posRatio?: number
  negRatio?: number
  total?: number
  traitsAdjusted?: boolean
  error?: string
}

/* ------------------------------------------------------------------ */
/* 入参                                                                */
/* ------------------------------------------------------------------ */

export interface ListMessagesParams {
  /** 用户 ID(后端必填) */
  userId?: string
  sessionId?: string
  /** 单次拉取上限,默认 50 */
  limit?: number
  roleId?: string
  /** 向前翻页游标(后端 nextBefore 原样回传);首次拉取不传 */
  before?: string
  /** 向后翻页游标(后端 nextAfter 原样回传);滚动到当前已加载最新一条之后时传 */
  after?: string
  /** 日期筛选起始(YYYY-MM-DD,含);handleDatePick 一次性锚定时由前端传入 */
  startDate?: string
  /** 日期筛选截止(YYYY-MM-DD,含);handleDatePick 一次性锚定时由前端传入 */
  endDate?: string
}

export interface SubmitFeedbackParams {
  sessionId: string
  messageId: string
  /** 1 = 点赞；-1 = 踩；0 = 取消 */
  rating: 1 | -1 | 0
  comment?: string
  roleId?: string
}

/** 列出有消息的日期 —— 入参 */
export interface ListDatesParams {
  /** 用户 ID(后端必填) */
  userId?: string
  sessionId?: string
  /** 默认 'default' */
  roleId?: string
  /** 起始日期（含），YYYY-MM-DD；不传表示不限 */
  since?: string
  /** 截止日期（含），YYYY-MM-DD；不传表示不限 */
  until?: string
  /** 最多返回天数（默认 365，上限 3660） */
  limit?: number
}

/* ------------------------------------------------------------------ */
/* 实现                                                                */
/* ------------------------------------------------------------------ */

export function listSessionMessages(params: ListMessagesParams): Promise<ChatSessionMessagesResult> {
  return request.post('/chat/sessions/messages', {
    userId: params.userId,
    sessionId: params.sessionId,
    limit: params.limit ?? 50,
    roleId: params.roleId || 'default',
    before: params.before,
    after: params.after,
    startDate: params.startDate,
    endDate: params.endDate,
  })
}

export function submitFeedback(params: SubmitFeedbackParams): Promise<ChatFeedbackResult> {
  return request.post('/chat/feedback', {
    sessionId: params.sessionId,
    messageId: params.messageId,
    rating: params.rating,
    comment: params.comment || '',
    roleId: params.roleId || 'default',
  })
}

export function listSessionDates(params: ListDatesParams): Promise<ChatSessionDatesResult> {
  return request.post('/chat/sessions/dates', {
    userId: params.userId,
    sessionId: params.sessionId,
    roleId: params.roleId || 'default',
    since: params.since,
    until: params.until,
    limit: params.limit ?? 365,
  })
}
