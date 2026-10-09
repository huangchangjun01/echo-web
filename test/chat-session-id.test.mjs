// 单会话模型下的 sessionId 一致性回归测试
//
// 背景(单角色单会话产品模型):
//   - (user, role) → session_id 是确定性哈希:sessionIdFor(userId, roleId)
//   - 该值必须与后端 biz/chat_sessions.session_id_for 完全一致
//   - 这条 session_id 写到 chat_messages.session_id,前端调 /chat 时
//     用它做 row id(本地标识;与 auth sessionId 区分开)
//   - upload.ts 三个写接口仍带 auth sessionId(getAuthSessionId 走的还是 auth 流)
//
// 这组测试用读源码 + 正则断言锁定契约,避免起 jsdom/vitest ——
// 任何对 ChatPage / chat store / session util 的回退改动都会立刻失败。
//
// 覆盖契约:
//   1. utils/sessionId.ts 导出 sessionIdFor,且内部用 sha256 + 返回 32 字符 hex
//   2. ChatPage 的 localSessionId 用 sessionIdFor(userId, roleId) 算出来
//   3. ChatPage 调 sendChatMessageStream 时 payload.sessionId = localSessionId
//   4. 切角色 / 切 sessionId 不会再创建新会话,因为 (user, role) 唯一

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatPageSrc = await readFile(
  new URL('../src/views/chat/ChatPage.vue', import.meta.url),
  'utf-8',
)
const sessionIdUtilSrc = await readFile(
  new URL('../src/utils/sessionId.ts', import.meta.url),
  'utf-8',
)

// ---------------------------------------------------------------------------
// 1. sessionIdFor 工具存在且使用 SHA-256
// ---------------------------------------------------------------------------

test('utils/sessionId.ts 导出 sessionIdFor 且使用 SHA-256', () => {
  assert.ok(
    /export\s+function\s+sessionIdFor\s*\(/.test(sessionIdUtilSrc),
    'utils/sessionId 必须 export sessionIdFor(userId, roleId)',
  )
  assert.ok(
    /sha256/i.test(sessionIdUtilSrc),
    'sessionIdFor 内部应该用 sha256(与后端 hashlib.sha256 对齐)',
  )
})

test('sessionIdFor 返回 32 字符 hex(后端 [:32] 对齐)', () => {
  assert.ok(
    /\.slice\(\s*0\s*,\s*32\s*\)/.test(sessionIdUtilSrc),
    'sessionIdFor 应返回 32 字符 hex(从 hex 截 [:32])',
  )
})

test('sessionIdFor 默认值是 "default"(处理 null/undefined role_id)', () => {
  // 兼容后端 session_id_for(user_id, role_id) 里 role_id or 'default'
  const fn = sessionIdUtilSrc.match(/function\s+sessionIdFor[\s\S]*?\n}/)
  assert.ok(fn, '应能找到 sessionIdFor 定义块')
  assert.ok(
    /role_id\s*\|\|\s*'default'/i.test(fn[0]) ||
      /role\s*\|\|\s*'default'/.test(fn[0]) ||
      /roleId\s*\|\|\s*'default'/.test(fn[0]),
    'sessionIdFor 必须把 null/undefined roleId 兜底为 "default"',
  )
})

// ---------------------------------------------------------------------------
// 2. ChatPage 的 localSessionId 用 sessionIdFor(userId, roleId)
// ---------------------------------------------------------------------------

test('ChatPage 的 localSessionId 是 sessionIdFor(userId, roleId) 的 computed', () => {
  assert.ok(
    /const\s+localSessionId\s*=\s*computed\(\s*\(\)\s*=>\s*sessionIdFor\(/.test(
      chatPageSrc,
    ),
    'ChatPage 必须用 sessionIdFor(userId, roleId) 算 localSessionId',
  )
})

test('localSessionId 不再用 nanoid / IP 派生(那是旧的 defaultSessionId 行为)', () => {
  // 把整个 localSessionId 定义块抠出来,验证内部没用 nanoid / ip_
  const block = chatPageSrc.match(/const\s+localSessionId[\s\S]*?\)/)
  assert.ok(block, '应能找到 localSessionId 定义块')
  assert.ok(
    !/nanoid/.test(block[0]),
    'localSessionId 不应再用 nanoid —— 那是 (user, role) 唯一确定的值',
  )
  assert.ok(
    !/ip_/.test(block[0]),
    'localSessionId 不应再用 IP 派生 —— 那是 wire sessionId,不是 chat row id',
  )
})

// ---------------------------------------------------------------------------
// 3. ChatPage 调 sendChatMessageStream 时 payload.sessionId = localSessionId
// ---------------------------------------------------------------------------

test('sendChatMessageStream 的 sessionId 字段来源于 localSessionId', () => {
  // 接受两种形式:
  //   (a) `sessionId: localSessionId,`
  //   (b) `sessionId: sid,` 其中 sid = localSessionId.value
  // 两种都满足「sessionId 来自 localSessionId 的派生」
  const hasDirect = /\bsessionId:\s*localSessionId\b/.test(chatPageSrc)
  const hasIndirect =
    /\bsessionId:\s*sid\b/.test(chatPageSrc) &&
    /const\s+sid\s*=\s*localSessionId\.value\b/.test(chatPageSrc)
  assert.ok(
    hasDirect || hasIndirect,
    'sendChatMessageStream 的 sessionId 字段必须来自 localSessionId(直接或 sid 派生)',
  )
  // 不应再用 wireSessionId(那是 auth sessionId,不再用作 chat row id)
  assert.ok(
    !/\bsessionId:\s*wireSessionId\b/.test(chatPageSrc),
    'sendChatMessageStream 的 sessionId 字段不应是 wireSessionId(auth 维度)',
  )
  // 不应再用 defaultSessionId 兜底
  assert.ok(
    !/\bsessionId:\s*defaultSessionId\b/.test(chatPageSrc),
    'sendChatMessageStream 的 sessionId 字段不应是 defaultSessionId',
  )
})

// ---------------------------------------------------------------------------
// 4. 切换角色时 sessionId 跟着重新派生 —— 这是产品契约
// ---------------------------------------------------------------------------

test('切角色时 rolesStore.currentRoleId 变化会触发重新派生 sessionId', () => {
  // 单会话模型下,切角色 = 切 session_id。ChatPage 必须监听 currentRoleId
  // 并重做 loadInitialHistory + scrollToBottom,而不是「在同一个 session 里改 context」
  assert.ok(
    /watch\s*\(\s*\(\)\s*=>\s*rolesStore\.currentRoleId/.test(chatPageSrc) ||
      /watch\s*\(\s*\(\)\s*=>\s*[\w.]+\.currentRoleId/.test(chatPageSrc),
    'ChatPage 应 watch rolesStore.currentRoleId(切角色会换 session_id)',
  )
})