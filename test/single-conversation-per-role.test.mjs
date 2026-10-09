// 单角色单会话产品模型 —— 不变量回归测试
//
// 背景:产品决策 = 每个 (user, role) 对应唯一一条连续对话,没有 list / create /
//       update / delete 概念。历史只读浏览,按日期筛选。
//
// 这组测试用读源码 + 正则断言锁定不变量,避免起 jsdom/vitest ——
// 任何对 ChatPage / chat store / api/session 的回退改动都会立刻失败。
//
// 覆盖契约:
//   1. ChatPage.vue 没有 <aside class="echo-sidebar"> 块 / 「新对话」按钮
//   2. chat store 没有 serverSessions / streamingSessionId / switchSession / CRUD 方法
//   3. ChatPage 没有 onSession* 处理器 / sessionKeywordInput / sessionSentinel
//   4. ChatPage 没有 isCurrentSessionStreaming 引用(全部改成 chatStore.isStreaming)
//   5. api/session.ts 没有导出 listSessions / createSession / updateSession / deleteSession
//   6. sessionIdFor(userId, roleId) 存在且内部用 sha256
//   7. localSessionId 是 computed(() => sessionIdFor(...)),不是 nanoid / IP
//   8. setStreamingMessageId 签名回到单参
//   9. messages toolbar / history sentinel 模板存在(日期筛选 + 滚动触顶加载)
//  10. /chat/sessions/messages 路由存在,list/create/update/delete 路由不存在
//  11. 日期筛选变化时,ChatPage 必须主动拉取更早历史直到覆盖到 startMs(不能仅前端 filter)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatPageSrc = await readFile(
  new URL('../src/views/chat/ChatPage.vue', import.meta.url),
  'utf-8',
)
const chatStoreSrc = await readFile(
  new URL('../src/stores/chat.ts', import.meta.url),
  'utf-8',
)
const sessionApiSrc = await readFile(
  new URL('../src/api/session.ts', import.meta.url),
  'utf-8',
)
const sessionIdUtilSrc = await readFile(
  new URL('../src/utils/sessionId.ts', import.meta.url),
  'utf-8',
)
const routerSrc = await readFile(
  new URL('../src/router/index.ts', import.meta.url),
  'utf-8',
)

// ---------------------------------------------------------------------------
// 1. ChatPage 没有侧栏 + 新对话按钮
// ---------------------------------------------------------------------------

test('ChatPage 不再渲染 <aside class="echo-sidebar">', () => {
  assert.ok(
    !/<aside[^>]*class="[^"]*echo-sidebar/.test(chatPageSrc),
    'ChatPage 应该不再渲染侧栏 <aside> 块',
  )
})

test('ChatPage 不再有「新对话」按钮文字', () => {
  // 侧栏 header 里的「新对话」按钮已下线
  assert.ok(
    !/>\s*新对话\s*</.test(chatPageSrc),
    'ChatPage 不应出现「新对话」按钮文字',
  )
})

// ---------------------------------------------------------------------------
// 2. chat store 不再有 serverSessions / streamingSessionId / CRUD 方法
// ---------------------------------------------------------------------------

test('chat store 删除了 serverSessions / nextCursor / listLoading / listExhausted', () => {
  for (const sym of ['serverSessions', 'nextCursor', 'listLoading', 'listExhausted']) {
    assert.ok(
      !new RegExp(`\\b${sym}\\b`).test(chatStoreSrc),
      `chat store 仍残留 ${sym} —— 已下线`,
    )
  }
})

test('chat store 删除了 streamingSessionId', () => {
  assert.ok(
    !/streamingSessionId/.test(chatStoreSrc),
    'chat store 仍残留 streamingSessionId —— 单会话模型下不需要',
  )
})

test('chat store 删除了所有 CRUD / sidebar 列表方法', () => {
  for (const fn of [
    'createSessionRemote',
    'renameSessionRemote',
    'deleteSessionRemote',
    'switchSession',
    'refreshCurrentSessionInList',
    'resetSessionList',
    'loadMoreSessions',
    'setSessionKeyword',
    'sessionItemToChatSession',
  ]) {
    assert.ok(
      !new RegExp(`\\b${fn}\\b`).test(chatStoreSrc),
      `chat store 仍残留 ${fn} —— 已下线`,
    )
  }
  // bumpSessionOnMessage 仍存在但语义收敛(只刷本地 msgCount,不写 title)
  // 不强制要求删除 —— 保留为可读 helper
})

test('chat store 删除了侧栏标题推导 helper', () => {
  for (const fn of [
    'resolveSessionDisplayTitle',
    'deriveTitleFromContent',
    'deriveTitleFromExchange',
    'isDefaultTitle',
  ]) {
    assert.ok(
      !new RegExp(`\\b${fn}\\b`).test(chatStoreSrc),
      `chat store 仍残留 ${fn} —— 单会话模型下不需要侧栏标题`,
    )
  }
})

// ---------------------------------------------------------------------------
// 3. ChatPage 没有 onSession* handler / sessionKeywordInput / sessionSentinel
// ---------------------------------------------------------------------------

test('ChatPage 没有 onSession* 处理器', () => {
  for (const fn of [
    'onSessionClick',
    'onSessionRenameClick',
    'onSessionDeleteClick',
    'onSessionKeywordInput',
    'onSessionKeywordClear',
  ]) {
    assert.ok(
      !new RegExp(`\\b${fn}\\b`).test(chatPageSrc),
      `ChatPage 仍残留 ${fn} —— 已下线`,
    )
  }
})

test('ChatPage 没有侧栏哨兵 / 关键字 / 重命名状态', () => {
  for (const sym of [
    'sessionKeywordInput',
    'sessionSentinel',
    'renamingSessionId',
    'renameDraft',
    'renameInputRef',
    'keywordDebounceTimer',
    'sessionObserver',
  ]) {
    assert.ok(
      !new RegExp(`\\b${sym}\\b`).test(chatPageSrc),
      `ChatPage 仍残留 ${sym} —— 已下线`,
    )
  }
})

// ---------------------------------------------------------------------------
// 4. ChatPage 没有 isCurrentSessionStreaming(已统一改成 chatStore.isStreaming)
// ---------------------------------------------------------------------------

test('ChatPage 完全替换 isCurrentSessionStreaming', () => {
  assert.ok(
    !/isCurrentSessionStreaming/.test(chatPageSrc),
    'ChatPage 仍残留 isCurrentSessionStreaming —— 应当全部用 chatStore.isStreaming',
  )
})

// ---------------------------------------------------------------------------
// 5. api/session.ts 不再导出 list/create/update/delete session
// ---------------------------------------------------------------------------

test('api/session.ts 不再导出 listSessions/createSession/updateSession/deleteSession', () => {
  for (const fn of ['listSessions', 'createSession', 'updateSession', 'deleteSession']) {
    assert.ok(
      !new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(sessionApiSrc),
      `api/session.ts 仍 export ${fn} —— 已下线`,
    )
  }
})

test('api/session.ts 不再有 session list/create/update/delete 相关类型', () => {
  for (const t of [
    'ChatSessionItem',
    'ChatSessionListResult',
    'SessionCursor',
    'ChatSessionDetailResult',
    'ListSessionsParams',
    'CreateSessionParams',
    'UpdateSessionParams',
    'DeleteSessionParams',
  ]) {
    assert.ok(
      !new RegExp(`\\b${t}\\b`).test(sessionApiSrc),
      `api/session.ts 仍 export type ${t} —— 已下线`,
    )
  }
})

test('api/session.ts 保留 listSessionMessages + submitFeedback,且支持 before 游标', () => {
  assert.ok(
    /export\s+function\s+listSessionMessages/.test(sessionApiSrc),
    'api/session.ts 应保留 listSessionMessages 导出',
  )
  assert.ok(
    /export\s+function\s+submitFeedback/.test(sessionApiSrc),
    'api/session.ts 应保留 submitFeedback 导出',
  )
  // before 参数应该存在
  assert.ok(
    /before\?:/.test(sessionApiSrc),
    'listSessionMessages 应支持 before 翻页游标',
  )
  assert.ok(
    /nextBefore/.test(sessionApiSrc),
    'messages 响应应包含 nextBefore',
  )
})

// ---------------------------------------------------------------------------
// 6. sessionIdFor(userId, roleId) 存在且内部用 sha256
// ---------------------------------------------------------------------------

test('utils/sessionId.ts 导出 sessionIdFor 且使用 SHA-256', () => {
  assert.ok(
    /export\s+function\s+sessionIdFor/.test(sessionIdUtilSrc),
    'sessionId util 必须 export sessionIdFor',
  )
  assert.ok(
    /sha256/i.test(sessionIdUtilSrc),
    'sessionIdFor 应该用 SHA-256(与后端 hashlib.sha256 对齐)',
  )
  // 返回值是 hex 前 32 字符(从 hex 中截 [:32])
  assert.ok(
    /\.slice\(0\s*,\s*32\)/.test(sessionIdUtilSrc),
    'sessionIdFor 应该返回 32 字符 hex(后端 [:32] 对齐)',
  )
})

// ---------------------------------------------------------------------------
// 7. localSessionId 用 sessionIdFor(userId, roleId),不是 nanoid / IP 派生
// ---------------------------------------------------------------------------

test('ChatPage 的 localSessionId 用 sessionIdFor(userId, roleId)', () => {
  assert.ok(
    /const\s+localSessionId\s*=\s*computed\(\s*\(\)\s*=>\s*sessionIdFor\(/.test(
      chatPageSrc,
    ),
    'ChatPage 的 localSessionId 必须基于 sessionIdFor(userId, roleId)',
  )
  // 不能用 nanoid 或 IP 派生(那是旧的 defaultSessionId 行为)
  const localSection = chatPageSrc.match(/const\s+localSessionId[\s\S]*?\)[\s\S]{0,400}/)
  assert.ok(localSection, '应能找到 localSessionId 定义块')
  assert.ok(
    !/nanoid/.test(localSection[0]),
    'localSessionId 不应再用 nanoid(那是 chat session id,不是 (user, role) id)',
  )
  assert.ok(
    !/ip_/.test(localSection[0]),
    'localSessionId 不应再用 IP 派生(那是 wire sessionId,不是 chat row id)',
  )
})

// ---------------------------------------------------------------------------
// 8. setStreamingMessageId 签名回到单参
// ---------------------------------------------------------------------------

test('chat store 的 setStreamingMessageId 是单参', () => {
  const m = chatStoreSrc.match(
    /function\s+setStreamingMessageId\s*\(([^)]*)\)/,
  )
  assert.ok(m, '应能找到 setStreamingMessageId 定义')
  const params = m[1].trim()
  assert.equal(
    params.split(',').filter((s) => s.trim()).length,
    1,
    `setStreamingMessageId 应只有 1 个参数,实际: ${params}`,
  )
})

// ---------------------------------------------------------------------------
// 9. ChatPage 有历史浏览 UI：日历按钮 + 双向滚动加载
// ---------------------------------------------------------------------------
//
// 2026-09-26 改造:筛选 UI 已下线,改成日历点击 → 一次性日期锚定 → 双向游标滚动。

test('ChatPage 有 messages-toolbar(只放历史按钮)+ history-sentinel(顶部触顶加载)', () => {
  assert.ok(
    /class="messages-toolbar"/.test(chatPageSrc),
    'ChatPage 应有 messages-toolbar 容器(放历史按钮)',
  )
  assert.ok(
    /class="history-sentinel"/.test(chatPageSrc),
    'ChatPage 应有 history-sentinel 元素(顶部触顶加载)',
  )
  assert.ok(
    /class="history-newer-sentinel"/.test(chatPageSrc),
    'ChatPage 应有 history-newer-sentinel 元素(底部触底加载)',
  )
  // 旧的 el-date-picker 不应再出现
  assert.ok(
    !/<el-date-picker\b/.test(chatPageSrc),
    'ChatPage 不应再有 el-date-picker(筛选 UI 已下线)',
  )
})

test('ChatPage 有 loadOlderMessages / loadNewerMessages 双向加载函数', () => {
  assert.ok(
    /async\s+function\s+loadOlderMessages/.test(chatPageSrc),
    'ChatPage 应有 loadOlderMessages 函数(before 游标)',
  )
  assert.ok(
    /async\s+function\s+loadNewerMessages/.test(chatPageSrc),
    'ChatPage 应有 loadNewerMessages 函数(after 游标)',
  )
})

// ---------------------------------------------------------------------------
// 10. API endpoint:只剩 /chat/sessions/messages 和 /chat/feedback,list/create/update/delete 已下线
// ---------------------------------------------------------------------------
//
// 注:前端 src/router/index.ts 是 Vue 页面级路由,后端 API 路由在 echo-core。
// 这里检查 api/session.ts 调用的 URL:必须只保留 messages + feedback。

test('api/session.ts 不再调用 list/create/update/delete session 端点', () => {
  for (const path of ['/chat/sessions/list', '/chat/sessions/create', '/chat/sessions/update', '/chat/sessions/delete']) {
    assert.ok(
      !new RegExp(path.replace(/\//g, '\\/')).test(sessionApiSrc),
      `api/session.ts 仍引用 ${path} —— 已下线`,
    )
  }
})

test('api/session.ts 仍调用 /chat/sessions/messages + /chat/feedback', () => {
  assert.ok(
    /\/chat\/sessions\/messages/.test(sessionApiSrc),
    'api/session.ts 应仍调用 /chat/sessions/messages',
  )
  assert.ok(
    /\/chat\/feedback/.test(sessionApiSrc),
    'api/session.ts 应仍调用 /chat/feedback',
  )
})

// Vue 页面路由只剩 ChatPage.vue(没有 Sidebar / SessionList 等组件级页面)
test('Vue router 不再注册侧栏 / 会话列表相关 page', () => {
  for (const component of [
    'SessionSidebar',
    'SidebarPage',
    'SessionListPage',
    'NewChatPage',
  ]) {
    assert.ok(
      !new RegExp(component).test(routerSrc),
      `Vue router 仍包含 ${component} 页面 —— 已下线`,
    )
  }
})

// ---------------------------------------------------------------------------
// 11. 日历点击日期 → anchorDate 一次性首屏锚定 + 双向游标衔接
// ---------------------------------------------------------------------------
//
// 2026-09-26 设计:
//   - 不再有 el-date-picker + 「筛选」按钮的常驻 UI。
//   - handleDatePick → anchorDate=picked → loadInitialHistory 当次带
//     startDate=endDate=picked → 加载后立刻清空 anchorDate;
//   - 后续 loadOlderMessages / loadNewerMessages 走纯游标(可能跨天)。
//   - 因此不需要 dateRangeApplied / activeStartDate / activeEndDate 这一组状态。

test('ChatPage 有 handleDatePick(设 anchorDate + 调 loadInitialHistory + scrollToTop)', () => {
  const body = chatPageSrc.match(/function\s+handleDatePick[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 handleDatePick 函数')
  assert.ok(
    /anchorDate\.value\s*=\s*picked/.test(body),
    'handleDatePick 必须 anchorDate.value = picked(一次性首屏锚定)',
  )
  assert.ok(
    /await\s+loadInitialHistory\s*\(\s*\)/.test(body),
    'handleDatePick 必须 await loadInitialHistory()(锚定首屏加载)',
  )
  assert.ok(
    /await\s+scrollToTop\s*\(\s*\)/.test(body),
    'handleDatePick 必须 await scrollToTop()(让当天最早一条对齐视口)',
  )
})

test('loadInitialHistory 锚定模式下透传 startDate/endDate', () => {
  const body = chatPageSrc.match(/async\s+function\s+loadInitialHistory\b[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '应能找到 loadInitialHistory 函数体')
  // 锚定分支必须透传 startDate/endDate
  assert.ok(
    /startDate\s*:\s*isAnchored/.test(body) || /startDate\s*:\s*isAnchored\s*\?/.test(body),
    'loadInitialHistory 锚定模式必须透传 startDate=anchoredDate',
  )
  assert.ok(
    /endDate\s*:\s*isAnchored/.test(body) || /endDate\s*:\s*isAnchored\s*\?/.test(body),
    'loadInitialHistory 锚定模式必须透传 endDate=anchoredDate',
  )
  // 加载后必须清空 anchorDate(一次性)
  assert.ok(
    /if\s*\(\s*isAnchored\s*\)\s*anchorDate\.value\s*=\s*null/.test(body),
    'loadInitialHistory 加载后必须清空 anchorDate(一次性锚定)',
  )
})

test('旧筛选链路已下线:applyDateFilter / dateRangeApplied / activeStartDate / summary', () => {
  // 这些符号全部不应再出现
  for (const sym of [
    /\bapplyDateFilter\b/,
    /\bdateRangeApplied\b/,
    /\bactiveStartDate\b/,
    /\bactiveEndDate\b/,
    /\bdateRangeLoading\b/,
    /\bisDateRangeComplete\b/,
    /\bfilteredMessages\b/,
    /\bfilteredMessageCount\b/,
    /\bclearDateRange\b/,
    /class=["']date-range-picker["']/,
    /class=["']date-filter-btn["']/,
    /class=["']date-clear-btn["']/,
    /class=["']messages-toolbar__summary["']/,
  ]) {
    assert.ok(
      !sym.test(chatPageSrc),
      `旧筛选链路残留: ${sym}`,
    )
  }
})
