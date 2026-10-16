// 用户消息操作栏位置回归测试 —— 锁定「复制 / 编辑 / 重试」按钮紧跟气泡的布局不变量。
//
// 背景(2026-10-09 修复):
//   - 用户反馈:【我】的消息旁的复制/编辑/重试按钮跑到对话框(整行)最左侧,
//     与气泡之间隔着一大片空白。
//   - 根因:message-actions 是 message-wrapper(row-reverse)的兄弟节点,
//     bubble-col 的 flex: 1 把操作栏推到整行最左。
//   - 修复:把操作栏收进 message-bubble-row 并置于气泡之前(DOM 顺序先于气泡),
//     渲染在气泡左侧;user 行内 flex + flex-end 贴右,assistant 不渲染操作栏,
//     row 默认 display: contents 不生成盒子,气泡宽度解析行为保持不变。
//
// 用读源码 + 正则断言锁定不变量,避免起 jsdom/浏览器。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatPageSrc = await readFile(
  new URL('../src/views/chat/ChatPage.vue', import.meta.url),
  'utf-8',
)

// ---------------------------------------------------------------------------
// 1. 模板结构:操作栏必须收在 message-bubble-row 内、位于气泡之前(渲染在气泡左侧)
// ---------------------------------------------------------------------------

test('模板:message-actions 在 message-bubble-row 内、位于气泡之前(渲染在气泡左侧)', () => {
  const rowBlock = chatPageSrc.match(
    /class="message-bubble-row"[\s\S]*?<div\s+class="message-actions"[\s\S]*?<\/div>\s*<div\s+class="message-bubble"/,
  )
  assert.ok(
    rowBlock,
    '应能找到「message-bubble-row → message-actions 收口 → 气泡」的结构:' +
      '操作栏在 DOM 中必须位于气泡之前(视觉渲染在气泡左侧),' +
      '且与气泡同在一行内(否则又会被 col 的 flex:1 推到整行最左)',
  )
})

test('模板:操作栏仍是 user 专属、编辑态隐藏', () => {
  assert.ok(
    /class="message-actions"\s+v-if="msg\.role === 'user' && !editingMessageId"/.test(
      chatPageSrc,
    ),
    '操作栏只应挂在 user 消息上,且编辑态隐藏',
  )
})

// ---------------------------------------------------------------------------
// 2. CSS:user 行内排布(整组贴右、按钮紧贴气泡左侧)
// ---------------------------------------------------------------------------

test('CSS:message-bubble-row--user 是 flex 行且整组贴右', () => {
  assert.ok(
    /\.message-bubble-row--user\s*\{[\s\S]*?display\s*:\s*flex/.test(chatPageSrc),
    '.message-bubble-row--user 必须是 flex 行 —— 操作栏与气泡并排',
  )
  assert.ok(
    /\.message-bubble-row--user\s*\{[\s\S]*?justify-content\s*:\s*flex-end/.test(
      chatPageSrc,
    ),
    '.message-bubble-row--user 必须 justify-content: flex-end —— 整组贴右,' +
      '按钮才会紧跟气泡左侧而不是跑到最左',
  )
})

test('CSS:message-bubble-row 默认 display: contents(不影响 assistant 气泡宽度解析)', () => {
  assert.ok(
    /\.message-bubble-row\s*\{[\s\S]*?display\s*:\s*contents/.test(chatPageSrc),
    '.message-bubble-row 默认 display: contents —— 不为 assistant 生成盒子,' +
      '气泡仍作为 col 直接子项解析宽度(见 chat-bubble-width 回归测试)',
  )
})

test('CSS:操作栏不再带 margin-top(已与气泡同行、底边对齐)', () => {
  const body = chatPageSrc.match(/\.message-actions\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.ok(body, '应能找到 .message-actions CSS 规则')
  assert.ok(
    !/margin-top/.test(body),
    '.message-actions 不应再有 margin-top —— 行内与气泡底边对齐',
  )
  assert.ok(
    /flex-shrink\s*:\s*0/.test(body),
    '.message-actions 必须 flex-shrink: 0 —— 不被长气泡挤压',
  )
})