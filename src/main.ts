import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { createPinia } from 'pinia'
import router from './router'
import { useAuthStore } from './stores/auth'
import './styles/global.css'
import App from './App.vue'

const app = createApp(App)

// Register all Element Plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// Element Plus 全量中文化:日历「上月/今天/下月」、分页、日期选择器等内置文案默认是英文
app.use(ElementPlus, { locale: zhCn })
app.use(createPinia())
app.use(router)

// 启动时恢复本地会话（验证 sessionId 仍有效）
const authStore = useAuthStore()
authStore.bootstrap()

app.mount('#app')
