<template>
  <div class="persona-tab">
    <!-- @submit.prevent="onFormSubmit": 阻止浏览器原生 form submit,避免在 input 中按回车触发整页刷新。
         页面刷新会丢弃 PersonaTab 的 local state,导致已输入的性格标签丢失。
         注:.prevent 必须配 handler(否则 Vue 不会注册 listener),这里用空函数占位。 -->
    <el-form label-position="top" class="persona-tab__form" @submit.prevent="onFormSubmit">
      <el-form-item>
        <template #label>
          <el-tooltip :content="TIP_IDENTITY" placement="top" popper-class="trait-tooltip" :show-after="200">
            <span class="persona-tab__label-hint">身份卡</span>
          </el-tooltip>
        </template>
        <el-input
          v-model="local.identity"
          type="textarea"
          :rows="3"
          placeholder="例如：22岁的女生，刚毕业，喜欢猫"
          maxlength="2000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item>
        <template #label>
          <el-tooltip :content="TIP_BACKGROUND" placement="top" popper-class="trait-tooltip" :show-after="200">
            <span class="persona-tab__label-hint">背景故事</span>
          </el-tooltip>
        </template>
        <el-input
          v-model="local.background"
          type="textarea"
          :rows="4"
          placeholder="角色的来历、过往、与用户的相识等"
          maxlength="2000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item>
        <template #label>
          <el-tooltip :content="TIP_TRAITS_TAGS" placement="top" popper-class="trait-tooltip" :show-after="200">
            <span class="persona-tab__label-hint">性格标签</span>
          </el-tooltip>
        </template>
        <div class="persona-tab__tags">
          <el-tag
            v-for="(tag, i) in local.traitsTags"
            :key="`tag-${i}`"
            closable
            class="persona-tab__tag"
            @close="removeTag(i)"
          >
            {{ tag }}
          </el-tag>
          <el-input
            v-if="addingTag"
            ref="tagInputRef"
            v-model="newTag"
            size="small"
            class="persona-tab__tag-input"
            @keyup.enter="addTag"
            @blur="addTag"
          />
          <el-button v-else size="small" @click="startAddTag">+ 添加标签</el-button>
        </div>
      </el-form-item>

      <el-form-item>
        <template #label>
          <el-tooltip :content="TIP_VALUES" placement="top" popper-class="trait-tooltip" :show-after="200">
            <span class="persona-tab__label-hint">价值观</span>
          </el-tooltip>
        </template>
        <div class="persona-tab__tags">
          <el-tag
            v-for="(v, i) in local.values"
            :key="`val-${i}`"
            closable
            type="success"
            class="persona-tab__tag"
            @close="removeValue(i)"
          >
            {{ v }}
          </el-tag>
          <el-input
            v-if="addingValue"
            ref="valueInputRef"
            v-model="newValue"
            size="small"
            class="persona-tab__tag-input"
            @keyup.enter="addValue"
            @blur="addValue"
          />
          <el-button v-else size="small" type="success" plain @click="startAddValue">+ 添加价值观</el-button>
        </div>
      </el-form-item>

      <el-form-item>
        <template #label>
          <el-tooltip :content="TIP_SPEAKING_STYLE" placement="top" popper-class="trait-tooltip" :show-after="200">
            <span class="persona-tab__label-hint">语气偏好</span>
          </el-tooltip>
        </template>
        <el-input
          v-model="local.speakingStyle"
          type="textarea"
          :rows="3"
          placeholder="例如：温柔但偶尔犀利，喜欢用 emoji"
          maxlength="1000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item>
        <template #label>
          <el-tooltip :content="TIP_TABOOS" placement="top" popper-class="trait-tooltip" :show-after="200">
            <span class="persona-tab__label-hint">禁忌话题</span>
          </el-tooltip>
        </template>
        <div class="persona-tab__tags">
          <el-tag
            v-for="(t, i) in local.taboos"
            :key="`tab-${i}`"
            closable
            type="danger"
            class="persona-tab__tag"
            @close="removeTaboo(i)"
          >
            {{ t }}
          </el-tag>
          <el-input
            v-if="addingTaboo"
            ref="tabooInputRef"
            v-model="newTaboo"
            size="small"
            class="persona-tab__tag-input"
            @keyup.enter="addTaboo"
            @blur="addTaboo"
          />
          <el-button v-else size="small" type="danger" plain @click="startAddTaboo">+ 添加禁忌</el-button>
        </div>
      </el-form-item>

      <el-form-item>
        <template #label>
          <el-tooltip :content="TIP_EXAMPLE_DIALOGS" placement="top" popper-class="trait-tooltip" :show-after="200">
            <span class="persona-tab__label-hint">示例对话</span>
          </el-tooltip>
        </template>
        <div class="persona-tab__examples">
          <div
            v-for="(ex, i) in local.exampleDialogs"
            :key="`ex-${i}`"
            class="persona-tab__example"
          >
            <el-input
              v-model="ex.user"
              placeholder="用户输入"
              size="small"
              class="persona-tab__example-user"
            />
            <el-input
              v-model="ex.assistant"
              placeholder="助手回复"
              size="small"
              type="textarea"
              :rows="2"
              class="persona-tab__example-assistant"
            />
            <el-button
              type="danger"
              :icon="Delete"
              circle
              size="small"
              @click="removeExample(i)"
            />
          </div>
          <el-button :icon="Plus" size="small" @click="addExample">+ 添加示例</el-button>
        </div>
      </el-form-item>

      <div class="persona-tab__actions">
        <el-button type="primary" @click="onSave">保存人格</el-button>
        <el-button @click="onReset">重置</el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref as useRef } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { ExampleDialog, RolePersona } from '@/types/roleCore'
import {
  TIP_BACKGROUND,
  TIP_EXAMPLE_DIALOGS,
  TIP_IDENTITY,
  TIP_SPEAKING_STYLE,
  TIP_TABOOS,
  TIP_TRAITS_TAGS,
  TIP_VALUES,
} from '@/types/roleCoreTooltips'

const props = defineProps<{
  modelValue: RolePersona
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: RolePersona): void
  (e: 'save', silent?: boolean): void
}>()

// 内部 working copy（避免直接改 props）
const local = reactive<RolePersona>({
  roleId: props.modelValue.roleId,
  identity: props.modelValue.identity,
  background: props.modelValue.background,
  traitsTags: [...(props.modelValue.traitsTags || [])],
  values: [...(props.modelValue.values || [])],
  speakingStyle: props.modelValue.speakingStyle,
  taboos: [...(props.modelValue.taboos || [])],
  exampleDialogs: (props.modelValue.exampleDialogs || []).map((e) => ({ ...e })),
})

// 标签输入态
const addingTag = useRef(false)
const newTag = useRef('')
const addingValue = useRef(false)
const newValue = useRef('')
const addingTaboo = useRef(false)
const newTaboo = useRef('')

function startAddTag() {
  addingTag.value = true
  newTag.value = ''
}
function addTag() {
  const v = newTag.value.trim()
  if (v) {
    local.traitsTags.push(v)
    addingTag.value = false
    // 性格标签是高频小颗粒的输入,回车后立刻静默落库,避免依赖「保存人格」按钮
    // —— 后者更适合身份/背景等大块文本编辑。
    persist(true)
    return
  }
  addingTag.value = false
}
function removeTag(i: number) {
  local.traitsTags.splice(i, 1)
}

function startAddValue() {
  addingValue.value = true
  newValue.value = ''
}
function addValue() {
  const v = newValue.value.trim()
  if (v) {
    local.values.push(v)
    addingValue.value = false
    persist(true)
    return
  }
  addingValue.value = false
}
function removeValue(i: number) {
  local.values.splice(i, 1)
}

function startAddTaboo() {
  addingTaboo.value = true
  newTaboo.value = ''
}
function addTaboo() {
  const v = newTaboo.value.trim()
  if (v) {
    local.taboos.push(v)
    addingTaboo.value = false
    persist(true)
    return
  }
  addingTaboo.value = false
}
function removeTaboo(i: number) {
  local.taboos.splice(i, 1)
}

function addExample() {
  local.exampleDialogs.push({ user: '', assistant: '' })
}
function removeExample(i: number) {
  local.exampleDialogs.splice(i, 1)
}

/** 占位 handler:仅用于配合 @submit.prevent,确保 el-form 注册 submit 监听器并调用 preventDefault */
function onFormSubmit() {
  // 实际的"保存"由各 el-input 的 keyup.enter / @click 显式触发,此处不做事
}

/**
 * 把 local 状态打包为持久化 DTO,并通知父组件保存。
 * - silent=true: 静默保存(不弹成功 toast),用于标签等高频小输入的回车自动落库
 * - silent=false: 由「保存人格」按钮触发,显示成功 toast
 */
function persist(silent: boolean) {
  // 过滤空 examples
  const filtered: ExampleDialog[] = local.exampleDialogs.filter(
    (e) => e.user?.trim() || e.assistant?.trim(),
  )
  const toSave: RolePersona = {
    ...local,
    traitsTags: local.traitsTags.filter((t) => t?.trim()),
    values: local.values.filter((v) => v?.trim()),
    taboos: local.taboos.filter((t) => t?.trim()),
    exampleDialogs: filtered,
  }
  emit('update:modelValue', toSave)
  emit('save', silent)
}

function onSave() {
  // 校验：身份卡和背景故事至少填一个(显式保存按钮才做这层校验)
  if (!local.identity?.trim() && !local.background?.trim()) {
    ElMessage.warning('身份卡和背景故事至少填一个')
    return
  }
  persist(false)
}

function onReset() {
  Object.assign(local, {
    roleId: props.modelValue.roleId,
    identity: props.modelValue.identity,
    background: props.modelValue.background,
    traitsTags: [...(props.modelValue.traitsTags || [])],
    values: [...(props.modelValue.values || [])],
    speakingStyle: props.modelValue.speakingStyle,
    taboos: [...(props.modelValue.taboos || [])],
    exampleDialogs: (props.modelValue.exampleDialogs || []).map((e) => ({ ...e })),
  })
}
</script>

<style scoped>
.persona-tab {
  padding: 0.5rem 0;
}

.persona-tab__form {
  max-width: 50rem;
}
/* el-form-item label slot 内嵌 tooltip 触发元素 */
.persona-tab__label-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: default;
}
.persona-tab__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
  min-height: 2.5rem;
}

.persona-tab__tag-input {
  width: 8rem;
}

.persona-tab__examples {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
}

.persona-tab__example {
  display: grid;
  grid-template-columns: 1fr 1.4fr auto;
  align-items: start;
  gap: 0.5rem;
  padding: 0.6rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
}

.persona-tab__actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1rem;
}
</style>