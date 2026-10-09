// 双向滚动加载 (before / after 游标) 契约测试
//
// 背景 (2026-09-26 新增):
//   用户希望日历点击 23 号 → 当天最早一条 → 上滑加载 22 号 / 下滑加载 24 号。
//   老的 list_messages 只支持 before 游标(向前翻历史),需要补 after 游标
//   (向后翻更新)才能实现"下滑加载更新"。
//
// 本测试锁前后端契约:
//   1. 后端 biz.list_messages 新增 after 形参 + nextAfter 返回 + before/after 互斥
//   2. 后端 chat_session.py::ListMessagesReq 含 after 字段 + 422 互斥校验
//   3. 前端 src/api/session.ts::ListMessagesParams 含 after + ChatSessionMessagesResult 含 nextAfter
//   4. 前端 ChatPage::loadNewerMessages 用 after 游标 + append(不是 prepend)
//   5. 前端 ChatPage::onMessagesScroll 检测触底

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatPageSrc = await readFile(
  new URL('../src/views/chat/ChatPage.vue', import.meta.url),
  'utf-8',
)
const sessionApiSrc = await readFile(
  new URL('../src/api/session.ts', import.meta.url),
  'utf-8',
)
const aiBizSrc = await readFile(
  new URL('../../../Python/workspace/echo-ai/biz/chat_sessions.py', import.meta.url),
  'utf-8',
).catch(() => '')
const aiRouterSrc = await readFile(
  new URL('../../../Python/workspace/echo-ai/app/routers/chat_session.py', import.meta.url),
  'utf-8',
).catch(() => '')

// ---------------------------------------------------------------------------
// 1. 后端 biz:list_messages 加 after 形参 + SQL 镜像 + 返回 nextAfter
// ---------------------------------------------------------------------------

test('biz.list_messages 函数签名含 after 形参', () => {
  if (!aiBizSrc) return
  // 取出 list_messages 函数体
  const body = aiBizSrc.match(/async\s+def\s+list_messages[\s\S]*?return\s+\{[\s\S]*?\}/)?.[0]
  assert.ok(body, '应能找到 list_messages 函数体')
  assert.ok(
    /\bafter\s*:\s*tuple\s*\[\s*int\s*,\s*str\s*\]\s*\|\s*None\s*=\s*None\b/.test(body),
    'list_messages 必须新增 after: tuple[int, str] | None = None 形参',
  )
})

test('biz.list_messages SQL 含 (id, created_at) > ( 严格大于片段', () => {
  if (!aiBizSrc) return
  assert.ok(
    /AND\s+\(id,\s*created_at\)\s*>\s*\(\s*%s\s*,\s*%s\s*\)/.test(aiBizSrc),
    'list_messages 必须拼接 `(id, created_at) > (%s, %s)` SQL 片段(after 游标镜像)',
  )
})

test('biz.list_messages before / after 互斥校验', () => {
  if (!aiBizSrc) return
  // 必须在 if before is not None and after is not None 时抛 ValueError
  const body = aiBizSrc.match(/async\s+def\s+list_messages[\s\S]*?return\s+\{[\s\S]*?\}/)?.[0]
  assert.ok(body, '应能找到 list_messages 函数体')
  assert.ok(
    /\bbefore\s+is\s+not\s+None\s+and\s+after\s+is\s+not\s+None\b/.test(body),
    'list_messages 必须显式判断 before 和 after 同时不为 None(互斥)',
  )
  assert.ok(
    /raise\s+ValueError/.test(body),
    'list_messages 必须 raise ValueError(互斥违反)',
  )
})

test('biz.list_messages 返回 nextAfter', () => {
  if (!aiBizSrc) return
  const body = aiBizSrc.match(/async\s+def\s+list_messages[\s\S]*?return\s+\{[\s\S]*?\}/)?.[0]
  assert.ok(body, '应能找到 list_messages 函数体')
  assert.ok(
    /\bnextAfter\s*:/.test(body),
    'list_messages 必须返回 nextAfter 字段(与 nextBefore 平行)',
  )
  // nextAfter 计算逻辑:has_more && items_desc && after is not None 时取 items 末位
  assert.ok(
    /next_after\s*=\s*\(/.test(body),
    'list_messages 必须计算 next_after 元组',
  )
})

test('biz.list_messages after 模式下 ORDER BY id ASC LIMIT N+1', () => {
  if (!aiBizSrc) return
  const body = aiBizSrc.match(/async\s+def\s+list_messages[\s\S]*?return\s+\{[\s\S]*?\}/)?.[0]
  assert.ok(body, '应能找到 list_messages 函数体')
  // 排序方向必须按 after 是否为 None 切换
  assert.ok(
    /order_dir\s*=\s*["']DESC["']\s+if\s+after\s+is\s+None\s+else\s+["']ASC["']/.test(body),
    'list_messages 必须按 after 是否为 None 切换 ORDER BY 方向(after 模式 ASC)',
  )
  assert.ok(
    /ORDER\s+BY\s+id\s+\{order_dir\}/.test(body),
    'SQL 必须用 f-string 注入 order_dir(after 模式 ASC)',
  )
})

// ---------------------------------------------------------------------------
// 2. 后端 router:ListMessagesReq 加 after 字段 + 422 互斥校验 + 返回 nextAfter
// ---------------------------------------------------------------------------

test('router.ListMessagesReq 含 after 字段', () => {
  if (!aiRouterSrc) return
  // 必须有 class ListMessagesReq { ... after: ... }
  const cls = aiRouterSrc.match(/class\s+ListMessagesReq\b[\s\S]*?\nclass\s/)?.[0]
  assert.ok(cls, '应能找到 ListMessagesReq 类体')
  assert.ok(
    /\bafter\s*:\s*str\s*\|\s*dict\s*\[\s*str\s*,\s*Any\s*\]\s*\|\s*None\s*=\s*None\b/.test(cls),
    'ListMessagesReq 必须新增 after 字段(str | dict | None)',
  )
})

test('router 通用化 _parse_cursor', () => {
  if (!aiRouterSrc) return
  // 旧的 _parse_before 应该被替换为 _parse_cursor
  assert.ok(
    !/\bdef\s+_parse_before\b/.test(aiRouterSrc),
    '_parse_before 应该被替换为 _parse_cursor(复用 before / after)',
  )
  assert.ok(
    /\bdef\s+_parse_cursor\b/.test(aiRouterSrc),
    '必须有 _parse_cursor 通用游标解析函数',
  )
  assert.ok(
    /\bdef\s+_encode_cursor\b/.test(aiRouterSrc),
    '必须有 _encode_cursor 通用游标编码函数(取代 _encode_next_before)',
  )
})

test('router before+after 同时传返回 422', () => {
  if (!aiRouterSrc) return
  // 必须有 HTTPException(status_code=422) 抛出
  assert.ok(
    /HTTPException\(\s*status_code\s*=\s*422\s*,/.test(aiRouterSrc),
    'before+after 同时传必须抛 HTTPException(422)',
  )
})

test('router /chat/sessions/messages 返回 nextAfter', () => {
  if (!aiRouterSrc) return
  // 端点函数返回结果必须含 nextAfter 字段
  const ep = aiRouterSrc.match(/async\s+def\s+list_messages_endpoint\b[\s\S]*?\n@router\.post/)?.[0]
  assert.ok(ep, '应能找到 list_messages_endpoint 函数体')
  assert.ok(
    /["']nextAfter["']\s*:/.test(ep),
    'list_messages_endpoint 必须返回 nextAfter 字段',
  )
  // 必须 await list_messages(..., after=after)
  assert.ok(
    /await\s+list_messages\(\s*[\s\S]{0,300}after\s*=/.test(ep),
    'list_messages_endpoint 必须把 after 透传给 biz.list_messages',
  )
})

// ---------------------------------------------------------------------------
// 3. 前端 API:ListMessagesParams.after + ChatSessionMessagesResult.nextAfter
// ---------------------------------------------------------------------------

test('ListMessagesParams 含 after 字段', () => {
  assert.ok(
    /export\s+interface\s+ListMessagesParams[\s\S]*?after\?:[\s\S]*?\}/.test(sessionApiSrc),
    'ListMessagesParams 必须含 after?: string 字段',
  )
})

test('ChatSessionMessagesResult 含 nextAfter 字段', () => {
  assert.ok(
    /export\s+interface\s+ChatSessionMessagesResult[\s\S]*?nextAfter\?:[\s\S]*?\}/.test(
      sessionApiSrc,
    ),
    'ChatSessionMessagesResult 必须含 nextAfter?: string | null 字段',
  )
})

test('listSessionMessages POST body 透传 after', () => {
  assert.ok(
    /listSessionMessages[\s\S]{0,400}after\s*:\s*params\.after/.test(sessionApiSrc),
    'listSessionMessages POST body 必须透传 after: params.after',
  )
})

// ---------------------------------------------------------------------------
// 4. 前端 ChatPage:loadNewerMessages + anchorDate + scrollToTop + onMessagesScroll 触底
// ---------------------------------------------------------------------------

test('ChatPage 有 loadNewerMessages 函数(after 游标 + append)', () => {
  const body = chatPageSrc.match(/async\s+function\s+loadNewerMessages[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 loadNewerMessages 函数')
  // 必须用 after: newerCursor.value 调 listSessionMessages
  assert.ok(
    /after\s*:\s*newerCursor\.value/.test(body),
    'loadNewerMessages 必须 after: newerCursor.value 透传游标',
  )
  // 必须 append(不是 prepend)
  assert.ok(
    /\[\s*\.\.\.\s*session\.messages\s*,\s*\.\.\.\s*newer\s*\]/.test(body),
    'loadNewerMessages 必须用 append 模式:[...session.messages, ...newer]',
  )
  assert.ok(
    !/\[\s*\.\.\.\s*newer\s*,\s*\.\.\.\s*session\.messages\s*\]/.test(body),
    'loadNewerMessages 不应是 prepend(那是 loadOlderMessages 的职责)',
  )
  // 必须更新 newerCursor / hasNewerHistory
  assert.ok(
    /newerCursor\.value\s*=\s*resp\.nextAfter/.test(body),
    'loadNewerMessages 必须更新 newerCursor = resp.nextAfter',
  )
  assert.ok(
    /hasNewerHistory\.value\s*=\s*Boolean\s*\(\s*resp\.nextAfter\s*\)/.test(body),
    'loadNewerMessages 必须更新 hasNewerHistory = Boolean(resp.nextAfter)',
  )
})

test('ChatPage loadInitialHistory 接受 anchorDate 一次性首屏锚定', () => {
  const body = chatPageSrc.match(/async\s+function\s+loadInitialHistory[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 loadInitialHistory 函数体')
  // 必须读 anchorDate.value,设 startDate=endDate,加载后清空
  assert.ok(
    /anchorDate\.value/.test(body),
    'loadInitialHistory 必须读 anchorDate.value',
  )
  assert.ok(
    /startDate\s*:\s*isAnchored\s*\?\s*anchoredDate\s*:\s*undefined/.test(body) ||
      /startDate\s*:\s*isAnchored\s*\?\s*anchoredDate\b/.test(body),
    'loadInitialHistory 必须在锚定时透传 startDate=anchoredDate',
  )
  assert.ok(
    /if\s*\(\s*isAnchored\s*\)\s*anchorDate\.value\s*=\s*null/.test(body),
    'loadInitialHistory 加载后必须立刻清空 anchorDate(一次性)',
  )
  // 必须更新 newerCursor / hasNewerHistory
  assert.ok(
    /newerCursor\.value\s*=\s*resp\.nextAfter/.test(body),
    'loadInitialHistory 必须更新 newerCursor = resp.nextAfter',
  )
  assert.ok(
    /hasNewerHistory\.value\s*=\s*Boolean\s*\(\s*resp\.nextAfter\s*\)/.test(body),
    'loadInitialHistory 必须更新 hasNewerHistory',
  )
})

test('ChatPage onMessagesScroll 检测触底 + 触发 loadNewerMessages', () => {
  const body = chatPageSrc.match(/function\s+onMessagesScroll[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 onMessagesScroll 函数体')
  // 必须检测 scrollTop + clientHeight + 100 >= scrollHeight(触底)
  assert.ok(
    /scrollTop\s*\+\s*el\.clientHeight\s*\+\s*100\s*>=\s*scrollHeight/.test(body) ||
      /scrollTop\s*\+\s*el\.clientHeight\s*\+\s*\d+\s*>=\s*el\.scrollHeight/.test(body),
    'onMessagesScroll 必须用 scrollTop+clientHeight+阈值 检测触底',
  )
  // 必须触发 loadNewerMessages
  assert.ok(
    /loadNewerMessages\s*\(\s*\)/.test(body),
    'onMessagesScroll 触底必须触发 loadNewerMessages()',
  )
  // 必须保留顶部触发 loadOlderMessages
  assert.ok(
    /loadOlderMessages\s*\(\s*\)/.test(body),
    'onMessagesScroll 触顶必须保留触发 loadOlderMessages()',
  )
})

test('ChatPage newerIndicator 三态计算属性(loading/exhausted/none)', () => {
  const body = chatPageSrc.match(
    /const\s+newerIndicator\s*=\s*computed[\s\S]*?\}\)/,
  )?.[0]
  assert.ok(body, '应有 newerIndicator 计算属性')
  assert.ok(/['"]loading['"]/.test(body), "newerIndicator 必须返回 'loading'")
  assert.ok(/['"]exhausted['"]/.test(body), "newerIndicator 必须返回 'exhausted'")
  assert.ok(/['"]none['"]/.test(body), "newerIndicator 必须返回 'none'")
  assert.ok(
    /hasNewerHistory\.value/.test(body),
    'newerIndicator 必须读 hasNewerHistory',
  )
})

test('ChatPage v-for 直接读 chatStore.currentSession?.messages(去掉 filteredMessages 中转)', () => {
  assert.ok(
    /v-for=["']msg in chatStore\.currentSession\?\.messages \?\? \[\]/.test(chatPageSrc),
    'messages-inner 的 v-for 必须直接读 chatStore.currentSession?.messages ?? []',
  )
})