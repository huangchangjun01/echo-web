import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/views/home/HomePage.vue'),
    meta: { title: '首页' },
  },
  {
    // 兼容历史 URL：旧版 router 把 /chat 当作根路径，这里收敛到 /admin/chat
    path: '/chat',
    redirect: '/admin/chat',
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/RegisterPage.vue'),
    meta: { title: '注册账号' },
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/admin/chat',
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('@/views/chat/ChatPage.vue'),
        meta: { title: '智能对话', fullBleed: true },
      },
      {
        path: 'memory',
        name: 'AdminMemory',
        component: () => import('@/views/admin/MemoryPage.vue'),
        meta: { title: '记忆管理' },
      },
      {
        path: 'memory/upload',
        redirect: '/admin/memory',
      },
      {
        path: 'upload',
        redirect: '/admin/memory',
      },
      {
        path: 'roles',
        name: 'AdminRoles',
        component: () => import('@/views/admin/RolesPage.vue'),
        meta: { title: '角色管理' },
      },
      {
        path: 'role-editor/:roleId?',
        name: 'AdminRoleEditor',
        component: () => import('@/views/admin/RoleEditorPage.vue'),
        meta: { title: '角色编辑器' },
      },
      {
        path: 'debug-panel/:roleId?',
        name: 'AdminDebugPanel',
        component: () => import('@/views/admin/DebugPanelPage.vue'),
        meta: { title: '调试面板' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/home',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = to.meta?.title as string | undefined
  document.title = title ? `${title} - Echo Web` : 'Echo Web'
})

export default router
