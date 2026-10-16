// 消息气泡时间显示 —— 不变量回归测试
//
// 背景 (2026-09-25 加):
//   - 用户反馈「对话聊天页面，对话增加时间显示」。
//   - 智能格式:今天 HH:MM / 本年内 MM-DD HH:MM / 跨年 YYYY-MM-DD HH:MM。
//   - 模板里每条 message-wrapper 都渲染一个 .message-time,放在 bubble 下方;
//     assistant 左对齐,user 右对齐。
//
// 这组测试用读源码 + 正则断言锁定不变量,避免起 jsdom/vitest。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatPageSrc = await readFile(
  new URL('../src/views/chat/ChatPage.vue', import.meta.url),
  'utf-8',
)

// ---------------------------------------------------------------------------
// 1. 函数存在 + 命名一致
// ---------------------------------------------------------------------------

test('ChatPage 有 formatMessageTime 函数', () => {
  assert.ok(
    /function\s+formatMessageTime\s*\(/.test(chatPageSrc),
    'ChatPage 应定义 formatMessageTime 函数(消息气泡下方时间戳的智能格式)',
  )
})

test('ChatPage 有 formatMessageTimeFull 函数(hover title 用)', () => {
  assert.ok(
    /function\s+formatMessageTimeFull\s*\(/.test(chatPageSrc),
    'ChatPage 应定义 formatMessageTimeFull 函数(hover 时显示完整时间)',
  )
})

test('formatMessageTime 用 padStart 做零填充,与现有 formatTime 风格一致', () => {
  const body = chatPageSrc.match(
    /function\s+formatMessageTime\s*\([\s\S]*?\n\}/,
  )?.[0]
  assert.ok(body, '应能找到 formatMessageTime 函数体')
  assert.ok(
    /padStart\(2\s*,\s*['"]0['"]\)/.test(body),
    'formatMessageTime 必须用 padStart(2, "0") 做零填充',
  )
})

test('formatMessageTime 对无效输入返回空串(0/NaN/Infinity)', () => {
  const body = chatPageSrc.match(
    /function\s+formatMessageTime\s*\([\s\S]*?\n\}/,
  )?.[0]
  assert.ok(body, '应能找到 formatMessageTime 函数体')
  // 必须显式兜底:!ts || !Number.isFinite(ts) 视为无效
  assert.ok(
    /!\s*ts\s*\|\|\s*!\s*Number\.isFinite\(\s*ts\s*\)/.test(body),
    'formatMessageTime 必须对 0 / NaN / Infinity 返回空串',
  )
  // 且必须再过滤 Date.getTime() === NaN
  assert.ok(
    /Number\.isNaN\(\s*d\.getTime\(\)\s*\)/.test(body),
    'formatMessageTime 必须再过滤 Date.getTime() 为 NaN 的情况',
  )
})

test('formatMessageTime 区分「今天」「本年」「跨年」三种粒度', () => {
  const body = chatPageSrc.match(
    /function\s+formatMessageTime\s*\([\s\S]*?\n\}/,
  )?.[0]
  assert.ok(body, '应能找到 formatMessageTime 函数体')
  // 必须分别判断 sameDay / sameYear
  assert.ok(
    /sameDay/.test(body),
    'formatMessageTime 必须有 sameDay 分支(今天 → HH:MM)',
  )
  assert.ok(
    /getFullYear\(\)\s*===\s*now\.getFullYear\(\)/.test(body),
    'formatMessageTime 必须按同年 vs 跨年分流',
  )
})

// ---------------------------------------------------------------------------
// 2. 模板渲染:每条消息都包了 .message-bubble-col + .message-time
// ---------------------------------------------------------------------------

test('模板里每条消息都在 .message-bubble-col 里', () => {
  // col 是新加的容器,负责纵向堆叠 bubble + 时间戳,并控制横向对齐
  assert.ok(
    /class="message-bubble-col"/.test(chatPageSrc),
    '消息模板必须用 .message-bubble-col 包住 bubble + 时间戳',
  )
  // Vue 模板里 :class 用 template literal 包裹:`message-bubble-col--${msg.role}`
  // 不像普通 attribute 用引号包整个 class,所以正则要允许 ` 字符
  assert.ok(
    /message-bubble-col--\$\{msg\.role\}/.test(chatPageSrc),
    '.message-bubble-col 必须按 msg.role 加修饰类(左/右对齐)',
  )
})

test('模板里 .message-time 同时挂在 assistant 和 user 上', () => {
  // 必须位于 message-bubble-col 内部:user 操作栏收进 message-bubble-row 后,
  // 时间戳紧随 bubble-row 之后、col 收口之前。
  const colBlock = chatPageSrc.match(
    /class="message-bubble-col"[\s\S]*?class="message-time"[\s\S]*?formatMessageTime\(msg\.createdAt\)/,
  )
  assert.ok(colBlock, '应能找到 message-bubble-col 内 message-time 的渲染区块')
  assert.ok(
    /class="message-time"/.test(colBlock[0]),
    '.message-bubble-col 内部必须有 .message-time 元素',
  )
  assert.ok(
    /formatMessageTime\(msg\.createdAt\)/.test(colBlock[0]),
    '.message-time 必须通过 formatMessageTime(msg.createdAt) 渲染内容',
  )
  assert.ok(
    /formatMessageTimeFull\(msg\.createdAt\)/.test(colBlock[0]),
    '.message-time 必须通过 formatMessageTimeFull(msg.createdAt) 渲染 title',
  )
  // 必须按角色加修饰类(避免纯一个 .message-time 通用样式无法区分对齐)
  // Vue template 里 :class 用反引号模板字面量包裹,所以不能像普通属性那样匹配引号
  assert.ok(
    /message-time--\$\{msg\.role\}/.test(colBlock[0]),
    '.message-time 必须按 msg.role 加修饰类(便于差异化样式)',
  )
})

test('消息模板里没有遗留旧的 message-time 占位(防止被覆盖回退)', () => {
  // 旧版本若回退成 <div class="message-time">{{ msg.time }}</div> 之类的硬编码,
  // 这条测试会失败,提醒开发者真正调 formatMessageTime。
  assert.ok(
    !/class="message-time"[^>]*>\s*\{\{\s*msg\.time\s*\}\}/.test(chatPageSrc),
    'message-time 不应再走旧的 msg.time 字段(那个字段是 pixel 模式 historyList 的产物)',
  )
})

// ---------------------------------------------------------------------------
// 3. CSS:列容器 + 时间戳样式存在且与设计意图一致
// ---------------------------------------------------------------------------

test('CSS 定义了 .message-bubble-col(纵向堆叠 bubble + 时间戳)', () => {
  assert.ok(
    /\.message-bubble-col\s*\{[\s\S]*?flex-direction\s*:\s*column/.test(chatPageSrc),
    '.message-bubble-col 必须是 column 布局',
  )
  assert.ok(
    /\.message-bubble-col--user\s*\{[\s\S]*?align-items\s*:\s*flex-end/.test(
      chatPageSrc,
    ),
    '.message-bubble-col--user 必须右对齐(让 bubble + 时间戳贴右侧)',
  )
  assert.ok(
    /\.message-bubble-col\s*\{[\s\S]*?align-items\s*:\s*flex-start/.test(
      chatPageSrc,
    ),
    '.message-bubble-col 默认左对齐(assistant 角色贴左)',
  )
})

test('CSS 定义了 .message-time 样式且 hover 时变亮', () => {
  assert.ok(
    /\.message-time\s*\{/.test(chatPageSrc),
    '必须有 .message-time 基础样式',
  )
  assert.ok(
    /\.message-time\s*\{[\s\S]*?color\s*:\s*rgba/.test(chatPageSrc),
    '.message-time 默认必须是低对比度的 rgba(不抢戏)',
  )
  assert.ok(
    /\.message-wrapper:hover\s+\.message-time\s*\{[\s\S]*?color\s*:\s*rgba/.test(
      chatPageSrc,
    ),
    '.message-time 必须在 hover message-wrapper 时变亮(交互反馈)',
  )
})

// ---------------------------------------------------------------------------
// 4. bubble 仍正确贴在自己那一侧(没有因为包 col 而跑偏)
// ---------------------------------------------------------------------------

test('user 消息依然 row-reverse(头像右侧、操作按钮左侧)', () => {
  // 防止后续重构把 row-reverse 删掉,导致 user 消息整体跑到左边
  assert.ok(
    /\.message-wrapper--user\s*\{[\s\S]*?flex-direction\s*:\s*row-reverse/.test(
      chatPageSrc,
    ),
    '.message-wrapper--user 仍必须是 row-reverse(user 头像永远在右)',
  )
})