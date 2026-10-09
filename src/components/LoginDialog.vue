<template>
  <!--
    登录弹窗
    - 父组件通过 v-model 控制显示
    - 内置账号/密码表单
    - 提供 "去注册" 入口，关闭弹窗后跳转 /register
    - 表单与样式都做了流体化，铺满浏览器后仍可读
  -->
  <el-dialog
    :model-value="modelValue"
    width="min(26rem, 92vw)"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    align-center
    class="login-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <template #header>
      <div class="login-dialog__header">
        <h3 class="login-dialog__title">登录 Echo Web</h3>
        <p class="login-dialog__subtitle">虚拟陪伴构建平台</p>
      </div>
    </template>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="login-form"
      @submit.prevent="handleLogin"
    >
      <el-form-item label="账号" prop="username">
        <el-input
          v-model="form.username"
          placeholder="请输入账号"
          clearable
          :prefix-icon="User"
          autocomplete="username"
          :disabled="submitting"
          :input-style="inputStyle"
        />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="请输入密码"
          show-password
          :prefix-icon="Lock"
          autocomplete="current-password"
          :disabled="submitting"
          :input-style="inputStyle"
          @keyup.enter="handleLogin"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="login-dialog__footer">
        <div class="login-dialog__tips">
          还没有账号？
          <a class="login-dialog__link" @click="goRegister">立即注册</a>
        </div>
        <div class="login-dialog__actions">
          <el-button plain :disabled="submitting" @click="emit('update:modelValue', false)">
            取消
          </el-button>
          <el-button
            type="primary"
            :disabled="submitting"
            class="login-dialog__submit"
            :class="{ 'is-submitting': submitting }"
            @click="handleLogin"
          >
            <span class="login-dialog__submit-text">
              {{ submitting ? '登录中…' : '登录' }}
            </span>
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

interface Props {
  modelValue: boolean
}
interface Emits {
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance | null>(null)
const submitting = ref(false)

const form = reactive({
  username: '',
  password: '',
})

/**
 * inputStyle 通过 el-input 的 :input-style 直接写入到原生 <input> 的内联 style，
 * 强制覆盖 disabled / autofill 各种状态下的字色，避免被 element-plus 默认主题
 * 或 Chrome autofill 默认色覆盖。backgroundColor 透明让输入框保留我们自定义的
 * wrapper 背景（rgba 透明度）。 */
const inputStyle = computed(() => ({
  color: '#c0c4cc',
  backgroundColor: 'transparent',
  WebkitTextFillColor: '#c0c4cc',
  caretColor: '#c0c4cc',
}))

const rules: FormRules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 3, max: 32, message: '账号长度 3-32 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 64, message: '密码长度 6-64 位', trigger: 'blur' },
  ],
}

function resetForm() {
  form.username = ''
  form.password = ''
  formRef.value?.clearValidate()
}

async function handleLogin() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await authStore.login({
      username: form.username.trim(),
      password: form.password,
    })
    emit('update:modelValue', false)
    emit('success')
    resetForm()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '登录失败'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

function goRegister() {
  emit('update:modelValue', false)
  resetForm()
  router.push('/register')
}
</script>

<style scoped>
/* dialog 本身 (背景 / body 文字色) 放在 global.css 中：
 * el-dialog 默认 teleport 到 body，scoped 样式穿透不到。 */

.login-dialog :deep(.el-dialog__header) {
  padding: clamp(1rem, 2vw, 1.5rem) clamp(1rem, 2vw, 1.5rem) 0;
  margin: 0;
}

.login-dialog :deep(.el-dialog__body) {
  padding: clamp(0.75rem, 1.6vw, 1.25rem) clamp(1rem, 2vw, 1.5rem);
}

.login-dialog :deep(.el-dialog__footer) {
  padding: 0 clamp(1rem, 2vw, 1.5rem) clamp(1rem, 2vw, 1.5rem);
}

.login-dialog__header {
  text-align: center;
}

.login-dialog__title {
  font-size: clamp(1.1rem, 1.5vw, 1.4rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.4rem;
}

.login-dialog__subtitle {
  font-size: clamp(0.75rem, 0.95vw, 0.9rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.login-form {
  margin-top: 0.5rem;
}

.login-form :deep(.el-form-item__label) {
  color: rgba(255, 255, 255, 0.7);
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  padding-bottom: 0.25rem;
  line-height: 1.2;
}

.login-form :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  border-radius: 0.5rem;
  padding: 0.4rem 0.75rem;
}

.login-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.5) inset;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.8) inset;
}

.login-form :deep(.el-input__inner) {
  color: #fff;
  font-size: clamp(0.85rem, 1.05vw, 0.95rem);
  height: clamp(2rem, 2.6vw, 2.4rem);
}
/* 通过 element-plus CSS 变量覆盖 disabled 文字色（推荐方式，跨选择器稳定生效），
 * 同时用 :deep(:disabled) 直接命中原生 input 元素，覆盖 Chrome 自动填充态。 */

.login-form :deep(.el-input__inner:disabled) {
  color: #c0c4cc !important;
  -webkit-text-fill-color: #c0c4cc !important;
}
.login-form :deep(input:-webkit-autofill:disabled),
.login-form :deep(input:-internal-autofill-selected:disabled) {
  -webkit-text-fill-color: #c0c4cc !important;
  color: #c0c4cc !important;
}
.login-form :deep(input:-webkit-autofill),
.login-form :deep(input:-webkit-autofill:hover),
.login-form :deep(input:-webkit-autofill:focus),
.login-form :deep(input:-internal-autofill-selected) {
  -webkit-text-fill-color: #c0c4cc !important;
  caret-color: #c0c4cc !important;
  transition: background-color 5000s ease-in-out 0s;
}
.login-form :deep(.el-input.is-disabled .el-input__inner) {
  color: #c0c4cc !important;
  -webkit-text-fill-color: #c0c4cc !important;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.login-form :deep(.el-input__prefix) {
  color: rgba(255, 255, 255, 0.45);
}

.login-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.login-dialog__tips {
  font-size: clamp(0.75rem, 0.9vw, 0.85rem);
  color: rgba(255, 255, 255, 0.55);
}

.login-dialog__link {
  color: #79abff;
  cursor: pointer;
  text-decoration: none;
  margin-left: 0.25rem;
}

.login-dialog__link:hover {
  color: #fff;
  text-decoration: underline;
}

.login-dialog__actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

/* 登录按钮：去掉默认 loading 旋转动画，改用文字态切换 + 轻微脉动表示进行中 */
.login-dialog__submit :deep(.el-loading-spinner) {
  display: none !important;
}

.login-dialog__submit :deep(.el-button__text) {
  display: none !important;
}

.login-dialog__submit-text {
  display: inline-block;
  transition: opacity 0.2s ease;
}

.login-dialog__submit.is-submitting {
  position: relative;
  overflow: hidden;
}

.login-dialog__submit.is-submitting::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 35%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.28) 50%,
    transparent 100%
  );
  animation: login-submit-shimmer 1.2s ease-in-out infinite;
  pointer-events: none;
}

@keyframes login-submit-shimmer {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(360%);
  }
}
</style>
