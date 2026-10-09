/**
 * 角色 Store
 *
 * 职责：
 *  - 维护当前用户的角色列表（roles）
 *  - 维护"当前激活角色" currentRoleId，全局生效，影响文件/记忆/对话等模块
 *  - localStorage 持久化 currentRoleId；刷新页面后自动恢复
 *  - 提供 fetchRoles / createRole / updateRole / deleteRole / switchRole
 *
 * 设计要点：
 *  - currentRoleId 仅在角色列表加载完成后才允许被业务模块读取；
 *    bootstrap() 内部串联拉取和回放切换，保证初始化时序可控。
 *  - 切换角色仅修改 ref，不重新拉取列表（避免列表闪烁）；列表与各业务模块自取。
 *  - 账号身份变化（登录 / 登出 / 会话过期）时自动清空并为新身份重新拉取：
 *    角色是「按用户」隔离的数据，沿用上一个身份（尤其是匿名态）的 currentRoleId
 *    会让 (user, role) 算出的会话哈希对不上，表现为"登录后进入智能对话页空白、
 *    刷新才恢复"（历史 bug 的根因）。
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as rolesApi from '@/api/roles'
import type { CreateRoleRequest, Role, UpdateRoleRequest } from '@/types/role'
import { useAuthStore } from '@/stores/auth'

const STORAGE_KEY = 'echo_current_role_id'

function readPersistedRoleId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writePersistedRoleId(value: string) {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, value)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* localStorage 不可用时静默忽略，避免阻断业务 */
  }
}

export const useRolesStore = defineStore('roles', () => {
  /** 角色列表 */
  const roles = ref<Role[]>([])
  /** 当前激活角色 ID（字符串） */
  const currentRoleId = ref<string>(readPersistedRoleId())
  /** 列表加载态（防止重复触发 fetch） */
  const loading = ref<boolean>(false)
  /** 首次加载是否完成（决定业务模块何时可以放心读 currentRoleId） */
  const bootstrapped = ref<boolean>(false)

  const currentRole = computed<Role | null>(() => {
    const id = currentRoleId.value
    if (!id) return null
    return roles.value.find((r) => String(r.id) === id) || null
  })

  function setCurrentRoleId(id: string) {
    currentRoleId.value = id
    writePersistedRoleId(id)
  }

  /** 拉取当前用户的角色列表。空列表时后端会自动建"默认角色"，所以这里一定 ≥1 条 */
  async function fetchRoles(): Promise<Role[]> {
    loading.value = true
    try {
      const list = await rolesApi.listRoles()
      roles.value = list

      // 首次加载：若持久化值不在列表中（或未持久化），回落到列表第一项
      const persistedId = currentRoleId.value
      const exists = list.some((r) => String(r.id) === persistedId)
      if (!persistedId || !exists) {
        const first = list[0]
        if (first) {
          setCurrentRoleId(String(first.id))
        }
      }
      // 只有真正拉取成功才算"已就绪"——失败时保持 false，
      // 让 AdminLayout 等页面在下一次挂载时重试（历史 bug：失败也置 true → 永不重试）
      bootstrapped.value = true
      return list
    } finally {
      loading.value = false
    }
  }

  /** 切换当前激活角色 */
  function switchRole(id: string | number) {
    setCurrentRoleId(String(id))
  }

  /** 创建角色；成功后自动切到新角色（提升"刚建就用"的体验） */
  async function createRole(payload: CreateRoleRequest): Promise<Role> {
    const created = await rolesApi.createRole(payload)
    roles.value.push(created)
    switchRole(created.id)
    ElMessage.success(`已创建并切换至角色"${created.name}"`)
    return created
  }

  /** 更新角色；成功后同步更新本地列表项 */
  async function updateRole(id: string | number, payload: UpdateRoleRequest): Promise<Role> {
    const updated = await rolesApi.updateRole(id, payload)
    const idx = roles.value.findIndex((r) => String(r.id) === String(id))
    if (idx >= 0) {
      roles.value.splice(idx, 1, updated)
    }
    ElMessage.success('角色已更新')
    return updated
  }

  /** 删除角色；若被删的是当前角色，自动切到列表第一项 */
  async function deleteRole(id: string | number): Promise<void> {
    await rolesApi.deleteRole(id)
    const sid = String(id)
    roles.value = roles.value.filter((r) => String(r.id) !== sid)
    if (currentRoleId.value === sid) {
      const fallback = roles.value[0]
      setCurrentRoleId(fallback ? String(fallback.id) : '')
    }
    ElMessage.success('角色已删除')
  }

  /** 清空本地状态（登出时由调用方触发） */
  function clear() {
    roles.value = []
    setCurrentRoleId('')
    bootstrapped.value = false
  }

  /**
   * 账号身份变化（登录 / 登出 / 会话过期）时，角色状态必须跟着换。
   *
   * 角色数据按用户隔离：沿用上一个身份（常见是匿名态）的 currentRoleId，
   * 会让聊天页按 (user, role) 算出的会话哈希命中一个不存在的会话，
   * 表现为"登录后进入【智能对话】页面空白，手动刷新才显示历史"。
   *
   * flush: 'sync' —— 保证清空发生在路由跳转 / 页面挂载之前，
   * AdminLayout 的 onMounted 才能看到 bootstrapped=false 并重新拉取。
   * 不做 immediate：页面启动时 authStore 已从 localStorage 恢复身份，
   * 此时应直接复用持久化的 currentRoleId（避免每次刷新都闪一次空角色）。
   */
  const authStore = useAuthStore()
  watch(
    () => authStore.currentUser?.id ?? null,
    (uid, prev) => {
      if (uid === prev) return
      clear()
      // 已登录（如刚登录成功）→ 立即为新账号拉取角色列表，
      // 不依赖 AdminLayout 的挂载时序；失败时保持未就绪，后续页面挂载会重试。
      if (authStore.isAuthenticated) {
        void fetchRoles().catch(() => {
          /* 拉取失败：bootstrapped 保持 false，交给后续挂载的页面重试 */
        })
      }
    },
    { flush: 'sync' },
  )

  return {
    roles,
    currentRoleId,
    currentRole,
    loading,
    bootstrapped,
    fetchRoles,
    switchRole,
    createRole,
    updateRole,
    deleteRole,
    clear,
  }
})
