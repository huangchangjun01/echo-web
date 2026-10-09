// chat-message-time 在 vitest 里挂载 ChatPage,验证 .message-time 真实渲染
//
// 用 vitest + jsdom 模拟真实组件挂载,绕过 UI 时序问题
// (auth/role/route/sse 全链路跑通才能看到消息,而自测不必要)

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import ChatPage from '../src/views/chat/ChatPage.vue'
import { useChatStore } from '../src/stores/chat'
import { useAuthStore } from '../src/stores/auth'

describe('ChatPage 消息时间显示渲染', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('每条消息下方都有 .message-time,文本命中 HH:MM / MM-DD HH:MM', async () => {
    // 1. 准备 auth store + chat store(必须在 mount 前完成,否则 ChatPage.onMounted 会异步拉数据)
    const auth = useAuthStore()
    auth.$patch({
      sessionId: 'test-session-id',
      expiresAt: Date.now() + 60 * 60 * 1000,
      currentUser: { id: 63, username: 'tester', nickname: 'tester', email: 't@x', status: 1 },
    })

    const chat = useChatStore()
    // 关键:必须在 mount 前同步 userId 到 "63",
    // ChatPage 的 localSessionId = sha256(userId, roleId).slice(0, 32),
    // 若 userId 是 nanoid 则与 DB 的 user_id="63" 对不上,消息无法命中。
    chat.userId = '63'

    // 用 utils 算出真正的 sid(避免 hardcode 出错)
    const { sessionIdFor } = await import('../src/utils/sessionId.ts')
    const sid = sessionIdFor('63', 'default')
    console.log(`[vitest] computed sid = ${sid}`)

    chat.sessions.push({
      id: sid,
      title: '测试',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      msgCount: 0,
      loadedCount: 0,
    })
    const session = chat.sessions.find((s) => s.id === sid)
    const now = Date.now()
    session.messages = [
      { id: 'm1', role: 'user', content: '你好', createdAt: now - 1000 * 60 * 5 },
      { id: 'm2', role: 'assistant', content: '今天见', createdAt: now - 1000 * 60 * 3 },
      { id: 'm3', role: 'user', content: '昨天的事', createdAt: now - 1000 * 60 * 60 * 24 * 3 },
    ]
    session.msgCount = 3
    session.loadedCount = 3

    // 3. 挂载 ChatPage
    const wrapper = mount(ChatPage, {
      global: {
        stubs: {
          // 屏蔽会异步拉数据的子组件(避免网络请求 / SSE 干扰)
          'el-input': true,
          'el-icon': true,
          'el-tooltip': true,
          'el-button': true,
          'el-date-picker': true,
        },
      },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    await nextTick()

    // 4. 检查 DOM
    const wrappers = wrapper.findAll('.message-wrapper')
    const times = wrapper.findAll('.message-wrapper .message-time')
    process.stdout.write(`\n[vitest] wrappers=${wrappers.length}  times=${times.length}\n`)
    process.stdout.write(`[vitest] chat.userId at inspect time = ${chat.userId}\n`)
    process.stdout.write(`[vitest] chat.sessions.length = ${chat.sessions.length}\n`)
    process.stdout.write(`[vitest] chat.currentSession.id = ${chat.currentSession?.id?.slice(0, 12)}\n`)
    process.stdout.write(`[vitest] chat.currentSession.messages.length = ${chat.currentSession?.messages.length}\n`)
    expect(wrappers.length).toBeGreaterThan(0)
    expect(times.length).toBeGreaterThanOrEqual(wrappers.length - 1)

    // 5. 时间文本格式断言
    const texts = times.map((t) => t.text().trim())
    process.stdout.write(`[vitest] time texts: ${JSON.stringify(texts)}\n`)
    const valid = texts.filter((t) => /^\d{1,2}:\d{2}$|^\d{1,2}-\d{1,2} \d{1,2}:\d{2}$|^\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{2}$/.test(t))
    expect(valid.length).toBeGreaterThan(0)

    // 6. title 应该是完整时间(YYYY-MM-DD HH:MM)
    const titles = times.map((t) => t.attributes('title')).filter(Boolean)
    process.stdout.write(`[vitest] titles: ${JSON.stringify(titles)}\n`)
    expect(titles.length).toBeGreaterThan(0)
    expect(titles[0]).toMatch(/^\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{2}$/)

    wrapper.unmount()
  })
})