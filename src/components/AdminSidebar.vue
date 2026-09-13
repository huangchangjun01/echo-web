<template>
  <aside class="admin-sidebar">
    <div class="sidebar-logo">
      <RouterLink to="/" class="sidebar-logo-link">
        <span class="logo-text">Echo Web</span>
      </RouterLink>
    </div>
    <nav class="sidebar-nav">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="sidebar-nav-item"
        active-class="sidebar-nav-item--active"
      >
        <el-icon class="nav-icon">
          <component :is="item.icon" />
        </el-icon>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { ChatDotRound, HomeFilled, User, FolderOpened, EditPen } from '@element-plus/icons-vue'

const navItems = [
  { path: '/home', label: '首页', icon: HomeFilled },
  { path: '/chat', label: '智能对话', icon: ChatDotRound },
  { path: '/admin/memory', label: '记忆管理', icon: FolderOpened },
  { path: '/admin/roles', label: '角色管理', icon: User },
  { path: '/admin/role-editor', label: '角色内核', icon: EditPen },
]
</script>

<style scoped>
.admin-sidebar {
  width: clamp(11rem, 14vw, 15rem);
  background: rgba(255, 255, 255, 0.03);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: hidden;
}

.sidebar-logo {
  height: clamp(3.25rem, 6vh, 4.5rem);
  display: flex;
  align-items: center;
  padding: 0 clamp(0.85rem, 1.5vw, 1.25rem);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-logo-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
}

.logo-text {
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  font-weight: 700;
  color: #fff;
}

.sidebar-nav {
  padding: clamp(0.75rem, 1.2vw, 1rem) 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  transition: color 0.2s, background-color 0.2s;
}

.sidebar-nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.sidebar-nav-item--active {
  color: #fff;
  background: rgba(22, 93, 255, 0.2);
}

.nav-icon {
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
}
</style>
