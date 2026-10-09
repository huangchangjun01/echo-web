<template>
  <div class="home-page">
    <div class="home-content">
      <!-- 已登录横幅：显示用户信息 + 登出按钮 -->
      <transition name="fade-down">
        <div v-if="authStore.isAuthenticated" class="user-banner">
          <div class="user-banner__avatar">
            <span>{{ (authStore.currentUser?.nickname || 'U').charAt(0) }}</span>
          </div>
          <div class="user-banner__info">
            <div class="user-banner__name">
              {{ authStore.currentUser?.nickname || authStore.currentUser?.username }}
            </div>
            <div class="user-banner__meta">
              欢迎回来 · 会话剩余 {{ remainingMinutes }} 分钟
            </div>
          </div>
          <el-button size="small" plain @click="handleLogout">退出登录</el-button>
        </div>
      </transition>

      <div class="home-header">
        <h1 class="home-title">Echo Web</h1>
        <p class="home-subtitle">虚拟陪伴构建平台</p>
      </div>

      <div class="home-cards">
        <div class="home-card" @click="goToChat">
          <div class="card-icon card-icon--chat">
            <el-icon :size="40"><ChatDotRound /></el-icon>
          </div>
          <div class="card-info">
            <h3 class="card-title">智能对话</h3>
            <p class="card-desc">与 AI 助手进行自然语言交互，获取信息与帮助</p>
          </div>
          <el-icon class="card-arrow"><ArrowRight /></el-icon>
        </div>

        <div class="home-card" @click="goToFile">
          <div class="card-icon card-icon--file">
            <el-icon :size="40"><Folder /></el-icon>
          </div>
          <div class="card-info">
            <h3 class="card-title">记忆管理</h3>
            <p class="card-desc">上传记忆文件、维护文本描述，按角色管理专属记忆</p>
          </div>
          <el-icon class="card-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <div class="home-footer">
        <p>基于 AI 技术构建，提供智能对话与记忆管理服务</p>
      </div>
    </div>

    <!-- 登录弹窗：未登录时自动弹出 -->
    <LoginDialog v-model="loginDialogVisible" @success="onLoginSuccess" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Folder, ArrowRight } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import LoginDialog from '@/components/LoginDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'

const router = useRouter()
const authStore = useAuthStore()
const rolesStore = useRolesStore()

const loginDialogVisible = ref(false)

/** 登录成功后要去往的目标路径。null 表示不强制跳转，让用户重新点卡片。 */
const pendingTarget = ref<string | null>(null)

const remainingMinutes = computed(() => {
  return Math.max(1, Math.floor(authStore.remainingMs / 60000))
})

function goToChat() {
  if (!authStore.isAuthenticated) {
    pendingTarget.value = '/chat'
    loginDialogVisible.value = true
    return
  }
  router.push('/chat')
}

function goToFile() {
  if (!authStore.isAuthenticated) {
    pendingTarget.value = '/admin/upload'
    loginDialogVisible.value = true
    return
  }
  router.push('/admin/upload')
}

function onLoginSuccess() {
  // 登录前用户点击了哪张卡片（智能对话 / 记忆管理），登录成功就自动跳过去，
  // 避免「登录成功 → 还要再点一次」的体验断点。
  const target = pendingTarget.value
  pendingTarget.value = null
  if (target) router.push(target)
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出当前账号吗？', '提示', {
      type: 'warning',
      confirmButtonText: '退出登录',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await authStore.logout()
  // 清空角色 store，避免下次登录复用上一个账号的 currentRoleId
  rolesStore.clear()
  loginDialogVisible.value = true
}

// 监听本地存储跨标签页同步：被其他标签登出时，关闭弹窗/跳转
function onStorage(e: StorageEvent) {
  if (e.key === 'echo_auth_session') {
    // 触发 store 重读
    authStore.bootstrap()
  }
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  if (!authStore.isAuthenticated) {
    // 给浏览器一帧时间渲染，让动画更平滑
    requestAnimationFrame(() => {
      loginDialogVisible.value = true
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
})
</script>

<style scoped>
.home-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - clamp(3.25rem, 6vh, 4.5rem));
  background: linear-gradient(135deg, #0a0a10 0%, #1a1a2e 50%, #0a0a10 100%);
  padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 2vw, 1.75rem);
}

.home-content {
  width: 100%;
  max-width: 50rem;
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.user-banner {
  display: flex;
  align-items: center;
  gap: clamp(0.75rem, 1.4vw, 1rem);
  padding: clamp(0.6rem, 1.4vw, 1rem) clamp(0.85rem, 1.8vw, 1.25rem);
  background: rgba(22, 93, 255, 0.08);
  border: 1px solid rgba(22, 93, 255, 0.25);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  margin-bottom: clamp(1.25rem, 2.4vw, 1.75rem);
}

.user-banner__avatar {
  width: clamp(2.4rem, 3.6vw, 3rem);
  height: clamp(2.4rem, 3.6vw, 3rem);
  border-radius: 50%;
  background: linear-gradient(135deg, #165dff 0%, #79abff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: clamp(1rem, 1.4vw, 1.25rem);
  font-weight: 600;
  flex-shrink: 0;
}

.user-banner__info {
  flex: 1;
  min-width: 0;
}

.user-banner__name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: clamp(0.9rem, 1.2vw, 1.05rem);
  font-weight: 600;
  color: #fff;
  flex-wrap: wrap;
}

.user-banner__meta {
  font-size: clamp(0.7rem, 0.9vw, 0.8rem);
  color: rgba(255, 255, 255, 0.55);
  margin-top: 0.15rem;
}

.fade-down-enter-active,
.fade-down-leave-active {
  transition: all 0.3s ease;
}

.fade-down-enter-from,
.fade-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.home-header {
  text-align: center;
  margin-bottom: clamp(1.75rem, 3.5vw, 3rem);
}

.home-title {
  font-size: clamp(1.75rem, 3.2vw, 2.6rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 clamp(0.4rem, 0.9vw, 0.75rem);
  letter-spacing: -0.04em;
  background: linear-gradient(135deg, #fff 0%, #79abff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.home-subtitle {
  font-size: clamp(0.8rem, 1.1vw, 1rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  letter-spacing: 0.12em;
}

.home-cards {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 1.4vw, 1.25rem);
}

.home-card {
  display: flex;
  align-items: center;
  gap: clamp(0.85rem, 1.8vw, 1.5rem);
  padding: clamp(1rem, 2vw, 1.75rem) clamp(1.2rem, 2.4vw, 2rem);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  cursor: pointer;
  transition: all 0.3s ease;
}

.home-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(22, 93, 255, 0.4);
  transform: translateX(8px);
}

.card-icon {
  width: clamp(3rem, 5.5vw, 4.5rem);
  height: clamp(3rem, 5.5vw, 4.5rem);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon--chat {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.3) 0%, rgba(22, 93, 255, 0.1) 100%);
  color: #79abff;
}

.card-icon--file {
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.3) 0%, rgba(64, 158, 255, 0.1) 100%);
  color: #40a9ff;
}

.card-info {
  flex: 1;
}

.card-title {
  font-size: clamp(1rem, 1.4vw, 1.25rem);
  font-weight: 600;
  color: #fff;
  margin: 0 0 0.5rem;
}

.card-desc {
  font-size: clamp(0.75rem, 0.95vw, 0.9rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  line-height: 1.5;
}

.card-arrow {
  font-size: clamp(1.1rem, 1.6vw, 1.5rem);
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.home-card:hover .card-arrow {
  color: rgba(255, 255, 255, 0.8);
  transform: translateX(4px);
}

.home-footer {
  text-align: center;
  margin-top: clamp(1.75rem, 3.5vw, 3rem);
}

.home-footer p {
  font-size: clamp(0.7rem, 0.85vw, 0.85rem);
  color: rgba(255, 255, 255, 0.3);
  margin: 0;
}
</style>
