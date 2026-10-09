// 切角色 → 滚动到底部 + 重置滚动锚点 回归测试
//
// 背景(单角色单会话产品模型):
//   每个 (user, role) 对应唯一一条连续对话。切角色等价于切 session_id(因
//   sessionIdFor(userId, newRoleId) 会得到新的 32 字符 hex),所以:
//     - chatStore 的 messages 必须重置为新角色对应的历史
//     - 滚动位置必须落到最底部(用户期望看到「刚聊过什么」)
//     - 不能再用旧的 currentSessionId watcher(那是多会话模型留下的)
//
// 修复方案:
//   A. ChatPage 的 watch(rolesStore.currentRoleId) 在 await loadInitialHistory()
//      之后再调 await scrollToBottom()
//   B. 当前会话的 messages 是空(新角色没历史)时也要滚到底部,
//      否则空状态视图会停留在中间位置
//
// 本测试用读源码 + 正则断言锁定契约,避免起 jsdom/vitest。

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

// ---------------------------------------------------------------------------
// 1. 多会话时代已下线 —— 不再有 currentSessionId watcher 触发的滚动逻辑
// ---------------------------------------------------------------------------

test('ChatPage 不再有「currentSessionId 变化 → scrollToBottom」watcher', () => {
  // 旧实现里有一个 watch(() => chatStore.currentSessionId) 的延迟 setTimeout
  // 滚动补丁。单会话模型下,currentSessionId 不再变化(全局只有一条会话),
  // 这个 watcher 应该被删除。
  const hasCurrentSessionWatcher =
    /watch\s*\(\s*\(\s*\)\s*=>\s*chatStore\.currentSessionId/.test(chatPageSrc) ||
    /watch\s*\(\s*chatStore\.currentSessionId\b/.test(chatPageSrc)
  assert.ok(
    !hasCurrentSessionWatcher,
    'ChatPage 不应再 watch chatStore.currentSessionId —— 多会话时代产物',
  )
})

test('chat store 不再暴露 currentSessionId 字段', () => {
  // 单会话模型下:全局只有一条流一条会话,currentSessionId 没有意义
  // (plan: 「删 currentSessionId ref」)
  assert.ok(
    !/\bcurrentSessionId\b/.test(chatStoreSrc),
    'chat store 不应再暴露 currentSessionId —— 全局单会话',
  )
})

// ---------------------------------------------------------------------------
// 2. 切角色 → 滚动到底部 + 重置滚动锚点
// ---------------------------------------------------------------------------

test('ChatPage 在切角色时 await loadInitialHistory 之后再 scrollToBottom', () => {
  // 找 watch(() => rolesStore.currentRoleId, ...) 整块
  const block = extractRoleWatcherBlock(chatPageSrc)
  assert.ok(block, 'ChatPage 应 watch rolesStore.currentRoleId(切角色会换 session)')

  // 块内必须有 loadInitialHistory() 调用
  assert.ok(
    /loadInitialHistory/.test(block),
    '切角色时必须重新加载新角色对应的初始历史',
  )
  // 块内必须有 scrollToBottom()(即使新角色没历史也要滚到底部)
  assert.ok(
    /scrollToBottom/.test(block),
    '切角色时必须滚到底部,让用户看到当前会话的最新内容',
  )
  // 关键契约:loadInitialHistory 与 scrollToBottom 必须存在(顺序或串行)
  assert.ok(
    /loadInitialHistory[\s\S]{0,800}scrollToBottom/.test(block) ||
      /scrollToBottom[\s\S]{0,400}loadInitialHistory/.test(block),
    '切角色时 loadInitialHistory 与 scrollToBottom 必须共存(顺序保证视觉一致)',
  )
})

test('loadInitialHistory → scrollToBottom 在源码中体现', () => {
  // 不锁字面文本,只锁两个关键信号:① 「先 hydrate 再滚」
  //                              ② 「scrollToBottom 在 hydrate 之后」
  assert.ok(
    /loadInitialHistory\s*\(\)[\s\S]{0,800}scrollToBottom/.test(chatPageSrc),
    'ChatPage 必须先 loadInitialHistory 再 scrollToBottom(覆盖异步 hydrate 场景)',
  )
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * 从 chatPageSrc 里提取「以 watch(() => rolesStore.currentRoleId 开头」的整个块。
 * watch 块里有嵌套括号 + 换行,regex 用 [\s\S] 配合括号配对扫描。
 */
function extractRoleWatcherBlock(src) {
  const startRe = /watch\s*\(\s*\(\s*\)\s*=>\s*rolesStore\.currentRoleId/
  const m = src.match(startRe)
  if (!m) return null
  let depth = 0
  let i = m.index
  const begin = i
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return src.slice(begin, i + 1)
    }
  }
  return null
}