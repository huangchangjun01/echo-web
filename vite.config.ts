import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      // /api/chat/sessions/* → echo-ai(8000),直连 FastAPI 端点;
      // echo-core 不代理这些路由(它只代理 /api/chat 流式 + 鉴权),
      // 历史消息 / 日历日期都走 FastAPI。rewrite 把 /api 前缀剥掉。
      '/api/chat/sessions': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // 其他 /api 走 echo-core(8080)
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
