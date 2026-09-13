import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 自动注入 X-Session-Id：从 authStore 读取，避免每个 API 模块手动加 header。
    // 排除登录/注册接口(尚未登录拿不到 sessionId,且不应污染鉴权请求)。
    const url = config.url || ''
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/check')
    if (!isAuthEndpoint) {
      try {
        const authStore = useAuthStore()
        const sid = authStore.sessionId
        if (sid) {
          config.headers = config.headers || ({} as any)
          ;(config.headers as Record<string, string>)['X-Session-Id'] = sid
        }
      } catch {
        // pinia 还未注入时静默忽略(例如 SSR / 单元测试)
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

request.interceptors.response.use(
  (response) => {
    // 任何 2xx 都视为"成功与后端交互"：把会话过期时间往前续。
    // 由 store 内部判断是否已登录以及是否需要写回，避免无谓写盘。
    try {
      const authStore = useAuthStore()
      authStore.touchSession()
    } catch {
      // pinia 还未注入（极早的请求）时静默忽略
    }
    return response.data
  },
  (error) => {
    // 401 表示后端判定 sessionId 已失效：清理本地会话，让上层走登录流
    // 其他 4xx/5xx 错误(包括业务 404)由业务层自行处理,避免全局 toast 噪音
    if (error.response?.status === 401) {
      try {
        const authStore = useAuthStore()
        authStore.clearSession()
      } catch {
        /* ignore */
      }
      ElMessage.error('会话已过期，请重新登录')
    }
    // 其他错误不自动弹 toast,留给业务层决定如何提示用户
    return Promise.reject(error)
  },
)

export default request
