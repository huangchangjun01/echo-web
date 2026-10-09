// messageItemToMessage 归一化历史 content 的回归测试
//
// 策略：
//   • \n\n+ 折叠成 \n\n（段落分隔由 ChatMarkdown 的 <br> 渲染成空行）
//   • 字间 / 句间的孤立 \n 折叠成空格（旧 STT、老代码路径、句间意外换行）
//   • 首尾空白 trim 掉
//
// 仅在归一化逻辑这一层验证 —— 渲染层由 ChatPage / ChatMarkdown 走 vitest 端到端覆盖。

import { describe, it, expect } from 'vitest'
import { messageItemToMessage } from '../src/stores/chat'

describe('messageItemToMessage — 历史 content 归一化（保留段落折行）', () => {
  const baseItem = {
    messageId: 'm1',
    role: 'user',
    content: '',
    createdAt: '2026-09-26T10:00:00.000Z',
  }

  it('段落分隔 \n\n 保留（用户选项）', () => {
    const m = messageItemToMessage({ ...baseItem, content: '第一段\n\n第二段' })
    expect(m.content).toBe('第一段\n\n第二段')
  })

  it('三连 \n\n\n 折叠成段落分隔 \n\n', () => {
    const m = messageItemToMessage({ ...baseItem, content: '第一段\n\n\n第二段' })
    expect(m.content).toBe('第一段\n\n第二段')
  })

  it('四连以上 \n\n\n\n+ 折叠成段落分隔 \n\n', () => {
    const m = messageItemToMessage({ ...baseItem, content: 'A\n\n\n\n\nB' })
    expect(m.content).toBe('A\n\nB')
  })

  it('孤立 \n 在句间 → 折成空格（旧 LLM 句间分隔 / 老代码路径）', () => {
    const m = messageItemToMessage({ ...baseItem, content: '你好。\n今天天气真好。' })
    expect(m.content).toBe('你好。 今天天气真好。')
  })

  it('孤立 \n 在字间（旧 STT 特征） → 全部折成空格', () => {
    const m = messageItemToMessage({ ...baseItem, content: '哈\n哈\n哈' })
    expect(m.content).toBe('哈 哈 哈')
  })

  it('混合：段落 + 句间 + 字间 同时出现', () => {
    const m = messageItemToMessage({
      ...baseItem,
      content: '哈\n哈\n哈\n\n第二段\n第二行。',
    })
    expect(m.content).toBe('哈 哈 哈\n\n第二段 第二行。')
  })

  it('首尾多余的 \n 和空格 → trim 掉（不影响段落分隔）', () => {
    const m = messageItemToMessage({ ...baseItem, content: '\n\n  哈哈哈  \n\n' })
    expect(m.content).toBe('哈哈哈')
  })

  it('首尾 \n 但中间保留段落 → trim 后段落不动', () => {
    const m = messageItemToMessage({ ...baseItem, content: '\n\n第一段\n\n第二段\n\n' })
    expect(m.content).toBe('第一段\n\n第二段')
  })

  it('纯 \n → 归一为空串', () => {
    const m = messageItemToMessage({ ...baseItem, content: '\n\n\n' })
    expect(m.content).toBe('')
  })

  it('没有 \n 的正常内容 → 原样保留', () => {
    const m = messageItemToMessage({ ...baseItem, content: '哈哈哈' })
    expect(m.content).toBe('哈哈哈')
  })

  it('空 content → 空串', () => {
    const m = messageItemToMessage({ ...baseItem, content: '' })
    expect(m.content).toBe('')
  })

  it('role 收敛到 user / assistant（system → assistant）', () => {
    const m1 = messageItemToMessage({ ...baseItem, role: 'system', content: 'sys' })
    expect(m1.role).toBe('assistant')
    const m2 = messageItemToMessage({ ...baseItem, role: 'user', content: 'usr' })
    expect(m2.role).toBe('user')
  })

  it('rating 为 number 时保留，否则归 null', () => {
    expect(messageItemToMessage({ ...baseItem, content: 'x', rating: 1 }).rating).toBe(1)
    expect(messageItemToMessage({ ...baseItem, content: 'x', rating: -1 }).rating).toBe(-1)
    expect(messageItemToMessage({ ...baseItem, content: 'x', rating: null }).rating).toBe(null)
    expect(messageItemToMessage({ ...baseItem, content: 'x' }).rating).toBe(null)
  })

  it('归一化对 assistant 也生效（保证两边排版一致）', () => {
    const m = messageItemToMessage({
      ...baseItem,
      role: 'assistant',
      content: '第一段。\n第二段。\n\n第三段。',
    })
    expect(m.content).toBe('第一段。 第二段。\n\n第三段。')
    expect(m.role).toBe('assistant')
  })

  it('历史 assistant 消息自动补全 stageState = 全 done（让阶段胶囊显示）', () => {
    // 后端 list_messages 不带 stageState,不补的话 StreamingBubble 的 v-if 会
    // 让 5 个阶段胶囊整体消失。这里补全为全 done,胶囊显示为绿色已完成。
    const m = messageItemToMessage({ ...baseItem, role: 'assistant', content: 'hi' })
    expect(m.stageState).toEqual({
      intent: 'done',
      recall_search: 'done',
      tool_dispatch: 'done',
      model_reasoning: 'done',
      answer: 'done',
    })
    // hasAnyStageActivity 计算属性走的就是这个逻辑
    expect(Object.values(m.stageState).some((s) => s !== 'idle')).toBe(true)
  })

  it('历史 user 消息不带 stageState（StageProgress 只对 assistant 渲染）', () => {
    const m = messageItemToMessage({ ...baseItem, role: 'user', content: 'hi' })
    expect(m.stageState).toBeUndefined()
  })
})

// 阶段明细（trace）：后端把每轮 assistant 的思考/工具调用/回忆命中/上下文随消息落库，
// list_messages 带回；这里验证历史消息映射后「胶囊」popover 能拿到这些数据。
describe('messageItemToMessage — 历史消息的阶段明细 trace 映射', () => {
  const traceItem = {
    messageId: 'm-trace',
    role: 'assistant',
    content: '回答',
    createdAt: '2026-09-30T10:00:00.000Z',
  }
  const trace = {
    thinkings: [{ stage: 'intent', text: '用户问天气' }],
    toolCalls: [{ name: 'search_memory', iter: 0, ok: true, summary: '命中 2 条' }],
    memoryRecall: {
      count: 1,
      hits: [{ memoryId: 'abc', topic: '骑车', summary: '周末兜风', similarity: 0.9 }],
    },
    context: { personaLen: 12, l0Count: 1, l1Count: 0 },
  }

  it('有 trace → thinkings / toolCalls / memoryRecall / context 全部映射', () => {
    const m = messageItemToMessage({ ...traceItem, trace })
    expect(m.thinkings).toEqual([{ stage: 'intent', text: '用户问天气' }])
    expect(m.toolCalls).toEqual([{ name: 'search_memory', iter: 0, ok: true, summary: '命中 2 条' }])
    expect(m.memoryRecall?.count).toBe(1)
    expect(m.memoryRecall?.hits[0].memoryId).toBe('abc')
    expect(m.memoryRecall?.hits[0].similarity).toBe(0.9)
    expect(m.context?.personaLen).toBe(12)
    expect(m.context?.l0Count).toBe(1)
  })

  it('无 trace（老消息）→ 明细为空，只保留全 done 的 stageState（回落占位提示）', () => {
    const m = messageItemToMessage({ ...traceItem, trace: null })
    expect(m.thinkings).toBeUndefined()
    expect(m.toolCalls).toBeUndefined()
    expect(m.memoryRecall).toBeUndefined()
    expect(m.context).toBeUndefined()
    expect(m.stageState?.intent).toBe('done')
  })

  it('trace 内空数组 → 不落成空数组（保持 undefined，避免 popover 出现空块）', () => {
    const m = messageItemToMessage({ ...traceItem, trace: { thinkings: [], toolCalls: [] } })
    expect(m.thinkings).toBeUndefined()
    expect(m.toolCalls).toBeUndefined()
  })

  it('trace 里 count=0 的 memoryRecall 保留（popover 可展示「共 0 条命中」）', () => {
    const m = messageItemToMessage({ ...traceItem, trace: { memoryRecall: { count: 0, hits: [] } } })
    expect(m.memoryRecall).toEqual({ count: 0, hits: [] })
  })
})