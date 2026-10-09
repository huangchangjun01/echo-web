// 历史日历视图回归测试
//
// 背景 (2026-09-25 新增,2026-09-26 改造):
//   用户要求把对话页的"查看历史"改成日历形式:
//   - 点开「历史」按钮 → 弹出 el-popover + el-calendar
//   - 日历格上当天有对话 → 显示绿色圆点
//   - 点某一天 → 跳转到当天最早一条对话(顶部对齐)
//   - 上滑 → 加载更早(可能跨天,游标模式)
//   - 下滑 → 加载更新(可能跨天,游标模式)
//
// 改造 (2026-09-26):
//   - 移除 el-date-picker / 「筛选」/ 「×」/ 「共 N 条」 整块筛选 UI
//   - handleDatePick 不再走 applyDateFilter,改为 anchorDate(一次性首屏锚定)
//     + loadInitialHistory(startDate=endDate=picked, limit=500)
//     + scrollToTop;后续纯游标跨天加载(loadOlderMessages / loadNewerMessages)
//
// 本测试锁前后端契约:
//   1. 后端 list_message_dates 函数 + /chat/sessions/dates 端点
//   2. 前端 listSessionDates API
//   3. 前端 ChatPage:el-popover + el-calendar + date-cell slot + 绿点 + handleDatePick(anchorDate 模式)

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
// 1. 后端 biz:list_message_dates 聚合有消息的日期
// ---------------------------------------------------------------------------

test('biz/chat_sessions.py 有 list_message_dates 函数', () => {
  if (!aiBizSrc) return
  assert.ok(
    /async\s+def\s+list_message_dates\s*\(/.test(aiBizSrc),
    'biz/chat_sessions.py 必须新增 list_message_dates async 函数',
  )
})

test('list_message_dates 用 GROUP BY DATE(created_at) 聚合', () => {
  if (!aiBizSrc) return
  // 锁定 SQL 模式:必须 GROUP BY DATE(created_at),不能只 GROUP BY created_at
  assert.ok(
    /GROUP\s+BY\s+DATE\s*\(\s*created_at\s*\)/i.test(aiBizSrc),
    'list_message_dates 必须 GROUP BY DATE(created_at)(按天聚合)',
  )
})

test('list_message_dates 按 d DESC 倒序输出', () => {
  if (!aiBizSrc) return
  assert.ok(
    /ORDER\s+BY\s+d\s+DESC/i.test(aiBizSrc),
    'list_message_dates 必须 ORDER BY d DESC(最近日期在前)',
  )
})

test('list_message_dates 用 aiomysql 参数化(%s 占位)', () => {
  if (!aiBizSrc) return
  // 取出 list_message_dates 函数体
  const body = aiBizSrc.match(/async\s+def\s+list_message_dates[\s\S]*?return\s+\{[\s\S]*?\}/)?.[0]
  assert.ok(body, '应能找到 list_message_dates 函数体')
  // 必须有 LIMIT %s(参数化)
  assert.ok(/LIMIT\s+%s/.test(body), 'list_message_dates 必须用 LIMIT %s 参数化天数上限')
  // 严禁 f-string 拼 user_id / role_id 进 SQL(防注入)
  assert.ok(
    !/f["'][^"']*\{[^}]*user_id[^}]*\}/.test(body),
    'list_message_dates 不应 f-string 拼 user_id 进 SQL(必须 %s 参数化)',
  )
})

// ---------------------------------------------------------------------------
// 2. 后端 router:POST /chat/sessions/dates
// ---------------------------------------------------------------------------

test('echo-ai router:ListDatesReq Pydantic 模型存在', () => {
  if (!aiRouterSrc) return
  assert.ok(
    /class\s+ListDatesReq\b/.test(aiRouterSrc),
    'chat_session.py 必须新增 ListDatesReq Pydantic 模型',
  )
})

test('echo-ai router:POST /chat/sessions/dates 端点存在', () => {
  if (!aiRouterSrc) return
  assert.ok(
    /@router\.post\(["']\s*\/chat\/sessions\/dates\s*["']\)/.test(aiRouterSrc),
    '必须有 POST /chat/sessions/dates 路由',
  )
  assert.ok(
    /async\s+def\s+list_dates_endpoint\b/.test(aiRouterSrc),
    '端点处理函数名应为 list_dates_endpoint',
  )
})

test('list_dates_endpoint 调用 biz 层 list_message_dates', () => {
  if (!aiRouterSrc) return
  assert.ok(
    /await\s+list_message_dates\s*\(/.test(aiRouterSrc),
    'list_dates_endpoint 必须 await biz.list_message_dates',
  )
})

test('list_dates_endpoint 返回 {ok, dates} 字段', () => {
  if (!aiRouterSrc) return
  assert.ok(
    /return\s+\{\s*["']ok["']\s*:\s*True\s*,\s*["']dates["']\s*:/.test(aiRouterSrc),
    '成功路径必须返回 {ok: true, dates: [...]}',
  )
})

// ---------------------------------------------------------------------------
// 3. 前端 API:listSessionDates
// ---------------------------------------------------------------------------

test('listSessionDates 函数被导出', () => {
  assert.ok(
    /export\s+function\s+listSessionDates\s*\(/.test(sessionApiSrc),
    'src/api/session.ts 必须 export listSessionDates',
  )
})

test('listSessionDates 透传 userId / sessionId / roleId / since / until / limit', () => {
  assert.ok(
    /listSessionDates[\s\S]{0,400}\/chat\/sessions\/dates/.test(sessionApiSrc),
    'listSessionDates 必须 POST /chat/sessions/dates',
  )
  assert.ok(/userId\s*:\s*params\.userId/.test(sessionApiSrc), 'POST body 必须带 userId(后端必填)')
  assert.ok(/sessionId\s*:\s*params\.sessionId/.test(sessionApiSrc), 'POST body 必须带 sessionId')
  assert.ok(/roleId\s*:\s*params\.roleId/.test(sessionApiSrc), 'POST body 必须带 roleId')
  assert.ok(/since\s*:\s*params\.since/.test(sessionApiSrc), 'POST body 必须带 since')
  assert.ok(/until\s*:\s*params\.until/.test(sessionApiSrc), 'POST body 必须带 until')
  assert.ok(/limit\s*:\s*params\.limit/.test(sessionApiSrc), 'POST body 必须带 limit')
})

test('ListDatesParams 接口有全部字段', () => {
  assert.ok(
    /export\s+interface\s+ListDatesParams[\s\S]*?userId\?[\s\S]*?sessionId\?[\s\S]*?roleId\?[\s\S]*?since\?[\s\S]*?until\?[\s\S]*?limit\?[\s\S]*?\}/.test(
      sessionApiSrc,
    ),
    'ListDatesParams 必须含 userId / sessionId / roleId / since / until / limit 字段',
  )
})

// ---------------------------------------------------------------------------
// 4. 前端 UI:ChatPage 工具栏里加了 el-popover + el-calendar
// ---------------------------------------------------------------------------

test('ChatPage 工具栏里出现 el-popover(包裹日历)', () => {
  assert.ok(
    /<el-popover[\s\S]{0,300}v-model:visible=["']historyPopoverOpen["']/.test(chatPageSrc),
    '模板里必须有 el-popover 且 v-model:visible 绑 historyPopoverOpen',
  )
})

test('ChatPage 历史按钮 .history-btn 渲染「历史」文本', () => {
  assert.ok(
    /class=["']history-btn["'][\s\S]{0,300}<span>\s*历史\s*<\/span>/.test(chatPageSrc),
    '历史按钮 .history-btn 内必须有「历史」文本',
  )
})

test('ChatPage 历史按钮使用 Calendar 图标', () => {
  // 模板里 .history-btn 子级有 <el-icon><Calendar /></el-icon>
  assert.ok(
    /class=["']history-btn["'][\s\S]{0,400}<el-icon><Calendar\s*\/><\/el-icon>/.test(chatPageSrc),
    '历史按钮必须用 <Calendar /> 图标',
  )
})

test('ChatPage 有 el-calendar 且 v-model 绑 historyCalendarDate', () => {
  assert.ok(
    /<el-calendar[\s\S]{0,200}v-model=["']historyCalendarDate["']/.test(chatPageSrc),
    '模板里必须有 el-calendar 且 v-model 绑 historyCalendarDate',
  )
})

test('el-calendar 使用 #date-cell slot 渲染绿点', () => {
  assert.ok(
    /<template\s+#date-cell/.test(chatPageSrc),
    '必须有 <template #date-cell> 自定义日期格 slot',
  )
  // slot 内部必须根据 sessionDates.has(data.day) 渲染 .history-calendar__dot
  assert.ok(
    /sessionDates\.has\(\s*data\.day\s*\)/.test(chatPageSrc),
    'date-cell slot 内必须用 sessionDates.has(data.day) 判定当天是否有对话',
  )
  assert.ok(
    /class=["']history-calendar__dot["']/.test(chatPageSrc),
    '必须有 .history-calendar__dot 绿点元素 class',
  )
})

// ---------------------------------------------------------------------------
// 5. 前端 UI:筛选 UI 已下线(2026-09-26 改造)
// ---------------------------------------------------------------------------

test('ChatPage 工具栏里不再出现 el-date-picker', () => {
  assert.ok(
    !/<el-date-picker\b/.test(chatPageSrc),
    '筛选 UI 已下线:模板里不应再出现 <el-date-picker>',
  )
})

test('ChatPage 不再有 date-filter-btn / date-clear-btn / messages-toolbar__summary', () => {
  assert.ok(
    !/class=["']date-filter-btn["']/.test(chatPageSrc),
    '不应再出现 .date-filter-btn(筛选按钮已下线)',
  )
  assert.ok(
    !/class=["']date-clear-btn["']/.test(chatPageSrc),
    '不应再出现 .date-clear-btn(清除按钮已下线)',
  )
  assert.ok(
    !/class=["']messages-toolbar__summary["']/.test(chatPageSrc),
    '不应再出现 .messages-toolbar__summary(摘要行已下线)',
  )
})

test('ChatPage 不再有 dateRange / dateRangeApplied / applyDateFilter / filteredMessages 等旧状态', () => {
  // 不应在脚本里再声明这些符号(模板引用也会被一起断言)
  assert.ok(
    !/\bconst\s+dateRange\s*=/.test(chatPageSrc),
    '不应再有 const dateRange ref(筛选 UI 已下线)',
  )
  assert.ok(
    !/\bdateRangeApplied\s*=/.test(chatPageSrc),
    '不应再有 dateRangeApplied 状态',
  )
  assert.ok(
    !/\bfunction\s+applyDateFilter\b/.test(chatPageSrc) &&
      !/\basync\s+function\s+applyDateFilter\b/.test(chatPageSrc),
    '不应再有 applyDateFilter 函数(筛选 UI 已下线)',
  )
  assert.ok(
    !/\bfunction\s+clearDateRange\b/.test(chatPageSrc) &&
      !/\basync\s+function\s+clearDateRange\b/.test(chatPageSrc),
    '不应再有 clearDateRange 函数',
  )
  assert.ok(
    !/\bconst\s+filteredMessages\s*=/.test(chatPageSrc),
    '不应再有 filteredMessages computed(直接走 chatStore.currentSession?.messages)',
  )
})

// ---------------------------------------------------------------------------
// 6. 前端 UI:点击日期走 anchorDate 模式 + scrollToTop
// ---------------------------------------------------------------------------

test('ChatPage 有 handleDatePick 函数 + 设 anchorDate + 调 scrollToTop', () => {
  const body = chatPageSrc.match(/function\s+handleDatePick[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 handleDatePick 函数')
  // 必须设 anchorDate.value = picked
  assert.ok(
    /anchorDate\.value\s*=\s*picked/.test(body),
    'handleDatePick 必须 anchorDate.value = picked(一次性首屏锚定)',
  )
  // 必须 await loadInitialHistory + scrollToTop
  assert.ok(
    /await\s+loadInitialHistory\s*\(\s*\)/.test(body),
    'handleDatePick 必须 await loadInitialHistory()(首屏锚定加载)',
  )
  assert.ok(
    /await\s+scrollToTop\s*\(\s*\)/.test(body),
    'handleDatePick 必须 await scrollToTop()(滚到顶部,让最早一条对齐视口)',
  )
  // 不应再走 applyDateFilter / dateRange 旧链路
  assert.ok(
    !/applyDateFilter\s*\(/.test(body),
    'handleDatePick 不应再调 applyDateFilter(旧链路已下线)',
  )
  assert.ok(
    !/dateRange\.value\s*=\s*\[/.test(body),
    'handleDatePick 不应再设 dateRange.value(旧链路已下线)',
  )
})

test('handleDatePick 点击事件挂到 date-cell 容器上', () => {
  assert.ok(
    /#date-cell[\s\S]{0,400}@click\.stop=["']handleDatePick\(/.test(chatPageSrc),
    'date-cell 容器必须 @click.stop="handleDatePick(...)",阻止冒泡到 el-calendar 默认翻月',
  )
})

test('ChatPage 有 handleHistoryClick 函数,首次打开触发 loadSessionDates', () => {
  const body = chatPageSrc.match(/async\s+function\s+handleHistoryClick[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 handleHistoryClick 函数')
  assert.ok(/loadSessionDates\s*\(/.test(body), '首次打开必须调用 loadSessionDates()')
})

test('ChatPage 有 loadSessionDates 函数,调用 listSessionDates', () => {
  const body = chatPageSrc.match(/async\s+function\s+loadSessionDates[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 loadSessionDates 函数')
  assert.ok(
    /listSessionDates\s*\(/.test(body),
    'loadSessionDates 必须调用 listSessionDates API',
  )
  assert.ok(
    /sessionDates\.value\s*=\s*new\s+Set\(/.test(body),
    'loadSessionDates 必须把结果写到 sessionDates Set',
  )
})

test('ChatPage 有 scrollToTop 函数(对齐 scrollToBottom 风格)', () => {
  const body = chatPageSrc.match(/async\s+function\s+scrollToTop[\s\S]*?\n\}/)?.[0]
  assert.ok(body, '必须有 scrollToTop 函数')
  assert.ok(
    /messagesArea\.value\.scrollTop\s*=\s*0/.test(body),
    'scrollToTop 必须把 messagesArea scrollTop 设为 0',
  )
  assert.ok(
    /requestAnimationFrame/.test(body),
    'scrollToTop 必须二次 requestAnimationFrame 补偿(对齐 scrollToBottom 模式)',
  )
})

// ---------------------------------------------------------------------------
// 7. CSS:绿点和日历暗色主题
// ---------------------------------------------------------------------------

test('CSS 有 .history-calendar__dot(绿点)且使用绿色背景', () => {
  assert.ok(
    /\.history-calendar__dot\s*\{[\s\S]{0,300}background:\s*#00b96b/.test(chatPageSrc),
    '.history-calendar__dot 必须使用 #00b96b 绿色背景',
  )
})

test('CSS 有 .history-calendar-popover 暗色覆写', () => {
  assert.ok(
    /history-calendar-popover[\s\S]{0,500}background:\s*#2a2a2a/.test(chatPageSrc),
    '.history-calendar-popover 必须是 #2a2a2a 暗色背景',
  )
})

test('CSS 有 .history-newer-sentinel(底部哨兵)兜底', () => {
  assert.ok(
    /\.history-newer-sentinel\s*\{/.test(chatPageSrc),
    '必须有 .history-newer-sentinel 触底哨兵样式(双向滚动模式)',
  )
})