// 账号身份变化 → 角色状态失效（回归测试，vitest + jsdom）
//
// 历史 bug：匿名态已经拉过角色（bootstrapped=true + 匿名用户的角色 id），
// 之后登录时角色状态没有跟着换 → AdminLayout 看到 bootstrapped=true 直接跳过
// 重新拉取 → 聊天页用「新用户 + 旧角色」算出错误的会话哈希 → 拉到空会话、
// 页面空白，只有手动刷新（store 重建、重新拉角色）才恢复。
//
// 不变量：
//   1. currentUser.id 变化（登录/登出/会话过期）→ 角色状态同步清空 + 已登录时自动重拉
//   2. 同一账号内 id 不变（如续期重设 currentUser）→ 不误清空
//
// 跑：`npx vitest run test/roles-auth-switch.test.mjs`

import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAuthStore } from '../src/stores/auth'
import { useRolesStore } from '../src/stores/roles'

describe('账号身份变化 → 角色状态失效', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('登录（currentUser 出现）同步清空匿名身份留下的角色状态', () => {
    const auth = useAuthStore()
    const roles = useRolesStore()

    // 匿名态：已经拉过角色（bootstrapped + 匿名角色 id 53 已持久化）
    roles.roles = [{ id: 53, name: '匿名默认角色' }]
    roles.switchRole('53')
    roles.bootstrapped = true
    expect(roles.currentRoleId).toBe('53')

    // 登录：currentUser: null → { id: 2 }
    auth.sessionId = 'sid-user-2'
    auth.expiresAt = Date.now() + 3600_000
    auth.currentUser = { id: 2, username: 'u2', nickname: '小暖' }

    // flush: 'sync' —— 断言此刻（跳转/挂载之前）状态已失效
    expect(roles.currentRoleId).toBe('')
    expect(roles.roles.length).toBe(0)
    expect(roles.bootstrapped).toBe(false)
  })

  it('登出（currentUser 变 null）同样清空，避免下一个身份复用', () => {
    const auth = useAuthStore()
    const roles = useRolesStore()

    auth.sessionId = 'sid-user-2'
    auth.expiresAt = Date.now() + 3600_000
    auth.currentUser = { id: 2, username: 'u2', nickname: '小暖' }
    roles.roles = [{ id: 3, name: '小暖' }]
    roles.switchRole('3')
    roles.bootstrapped = true

    // 会话过期 / 登出：currentUser → null
    auth.sessionId = ''
    auth.expiresAt = 0
    auth.currentUser = null

    expect(roles.currentRoleId).toBe('')
    expect(roles.roles.length).toBe(0)
    expect(roles.bootstrapped).toBe(false)
  })

  it('同一账号内 id 不变时不会误清空（如续期时重建 currentUser 对象）', () => {
    const auth = useAuthStore()
    const roles = useRolesStore()

    auth.sessionId = 'sid-user-3'
    auth.expiresAt = Date.now() + 3600_000
    auth.currentUser = { id: 3, username: 'u3', nickname: 'u3' }
    roles.roles = [{ id: 7, name: '测试角色' }]
    roles.switchRole('7')
    roles.bootstrapped = true

    // 同一 id、新的对象引用
    auth.currentUser = { id: 3, username: 'u3', nickname: 'u3' }

    expect(roles.currentRoleId).toBe('7')
    expect(roles.bootstrapped).toBe(true)
    expect(roles.roles.length).toBe(1)
  })
})