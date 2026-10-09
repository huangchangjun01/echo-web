// chat 气泡宽度回归测试 —— 用源码正则锁定气泡布局的不变量,
// 防止以后改 CSS 时把「窄气泡 / 提前折行 / 留白」这类回归重新引入。
//
// 背景(踩坑记录):
//   .message-bubble-col 是一个 column flex 容器。如果不给它确定宽度(flex: 1),
//   气泡的 width 会在「宽度不确定的父级」里解析错误 —— 短消息气泡被算得比内容窄,
//   文字被迫提前折行、右下留白一片;AI 气泡则被缩到「最长一行」的宽度,又窄又细、每句一行。
//
//   1. .message-bubble-col 必须 flex: 1
//      → col 拿到确定宽度,气泡的 fit-content / 100% 才能正确解析
//   2. .message-bubble--user 必须 width: fit-content
//      → 用户短消息按内容收缩(不折行不留白),长消息由 max-width: 90% 兜底
//   3. .message-bubble--assistant 必须 width: 100%,绝不能有 width: fit-content
//      → AI 气泡撑满容器,长内容整体按容器宽度换行(段落式),
//        而不是缩成「最长一行」宽度的「窄而细、每句一行」
//   4. .streaming-bubble(AI 气泡内层) 同样绝不能有 width: fit-content,保留 max-width: 99%

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatPageSrc = await readFile(
  new URL('../src/views/chat/ChatPage.vue', import.meta.url),
  'utf-8',
)
const streamingBubbleSrc = await readFile(
  new URL('../src/components/chat/StreamingBubble.vue', import.meta.url),
  'utf-8',
)

/**
 * 提取一个 CSS 规则的实际属性行 —— 跳过注释 `/* ... *\/`,只看 `<key>: <value>;` 行。
 * 注释里如果提到了禁用的关键字(比如「不要用 width: fit-content」),
 * 不会被误判为规则真的有这个属性。
 */
function ruleBody(src, selector) {
  const ruleMatch = src.match(new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!ruleMatch) return ''
  // 去掉 /* ... */ 注释块
  return ruleMatch[1].replace(/\/\*[\s\S]*?\*\//g, '')
}

// ---------------------------------------------------------------------------
// 1. bubble-col:.message-bubble-col 必须 flex: 1(气泡宽度解析的前提)
// ---------------------------------------------------------------------------

test('.message-bubble-col 必须有 flex: 1(让 col 有确定宽度,气泡宽度才能正确解析)', () => {
  const body = ruleBody(chatPageSrc, '.message-bubble-col')
  assert.ok(body, '应能找到 .message-bubble-col CSS 规则')
  assert.ok(
    /flex\s*:\s*1/.test(body),
    '.message-bubble-col 必须有 flex: 1 —— 否则气泡 width 解析错误:' +
      '用户短消息被提前折行、右侧留白,AI 气泡被缩成「最长一行」宽的窄条',
  )
})

test('.message-bubble-col 必须保留 max-width: 90%(留 10% 对侧留白)', () => {
  const body = ruleBody(chatPageSrc, '.message-bubble-col')
  assert.ok(body, '应能找到 .message-bubble-col CSS 规则')
  assert.ok(
    /max-width\s*:\s*90%/.test(body),
    '.message-bubble-col 必须保留 max-width: 90% —— 避免气泡贴满全行',
  )
})

// ---------------------------------------------------------------------------
// 2. 用户气泡:.message-bubble--user 必须 width: fit-content
// ---------------------------------------------------------------------------

test('.message-bubble--user 必须有 width: fit-content(短消息收缩,不折行不留白)', () => {
  const body = ruleBody(chatPageSrc, '.message-bubble--user')
  assert.ok(body, '应能找到 .message-bubble--user CSS 规则')
  assert.ok(
    /width\s*:\s*fit-content/.test(body),
    '.message-bubble--user 必须有 width: fit-content —— 短消息气泡按内容收缩,' +
      '长消息仍由 .message-bubble 的 max-width: 90% 兜底',
  )
})

test('.message-bubble 必须保留 max-width: 90%(长消息容器宽度换行的兜底)', () => {
  const body = ruleBody(chatPageSrc, '.message-bubble')
  assert.ok(body, '应能找到 .message-bubble CSS 规则')
  assert.ok(
    /max-width\s*:\s*90%/.test(body),
    '.message-bubble 必须保留 max-width: 90% —— 长消息按容器宽度换行',
  )
})

// ---------------------------------------------------------------------------
// 3. AI 气泡:.message-bubble--assistant 必须 width: 100%,且不能有 fit-content
// ---------------------------------------------------------------------------

test('.message-bubble--assistant 必须有 width: 100%(AI 气泡撑满容器,段落式换行)', () => {
  const body = ruleBody(chatPageSrc, '.message-bubble--assistant')
  assert.ok(body, '应能找到 .message-bubble--assistant CSS 规则')
  assert.ok(
    /width\s*:\s*100%/.test(body),
    '.message-bubble--assistant 必须有 width: 100% —— AI 回复撑满可用宽度,' +
      '长内容整体按容器宽度换行,而不是缩成窄条',
  )
})

test('.message-bubble--assistant 不能有 width: fit-content(避免 AI 回复又窄又细、每句一行)', () => {
  const body = ruleBody(chatPageSrc, '.message-bubble--assistant')
  assert.ok(body, '应能找到 .message-bubble--assistant CSS 规则')
  assert.ok(
    !/width\s*:\s*fit-content/.test(body),
    '.message-bubble--assistant 绝对不能有 width: fit-content —— LLM 句间 \\n 在' +
      'ChatMarkdown 里被渲染成 <br>,fit-content 会把气泡缩成「最长一行的宽度」,' +
      '视觉上变成窄而细、每句一行。',
  )
})

// ---------------------------------------------------------------------------
// 4. AI 内层气泡:.streaming-bubble 不能有 width: fit-content
// ---------------------------------------------------------------------------

test('.streaming-bubble 不能有 width: fit-content(避免 AI 回复又窄又细、每句一行)', () => {
  const body = ruleBody(streamingBubbleSrc, '.streaming-bubble')
  assert.ok(body, '应能找到 .streaming-bubble CSS 规则')
  assert.ok(
    !/width\s*:\s*fit-content/.test(body),
    '.streaming-bubble 绝对不能有 width: fit-content —— LLM 句间 \\n 在 ChatMarkdown 里被渲染成 <br>,' +
      'fit-content 会把气泡缩成「最长一行的宽度」,视觉上变成窄而细、每句一行。' +
      '默认 width: auto 让气泡撑到 max-width,长内容自然按容器宽度换行。',
  )
})

test('.streaming-bubble 必须保留 max-width: 99%(随窗口等比例缩放)', () => {
  const body = ruleBody(streamingBubbleSrc, '.streaming-bubble')
  assert.ok(body, '应能找到 .streaming-bubble CSS 规则')
  assert.ok(
    /max-width\s*:\s*99%/.test(body),
    '.streaming-bubble 必须保留 max-width: 99% —— 让 AI 回复气泡随窗口大小等比例缩放(99% 避免 inline-flex 子项被挤换行)',
  )
})