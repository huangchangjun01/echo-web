import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import StageProgress from '@/components/chat/StageProgress.vue'
import type { StageName, StageState } from '@/types/chat'

const idleState: Record<StageName, StageState> = {
  intent: 'idle',
  recall_search: 'idle',
  tool_dispatch: 'idle',
  model_reasoning: 'idle',
  answer: 'idle',
}

describe('StageProgress', () => {
  it('renders 5 chips when all stages idle', () => {
    const wrapper = mount(StageProgress, {
      props: { stageState: idleState },
    })
    expect(wrapper.findAll('.stage-chip')).toHaveLength(5)
    expect(wrapper.findAll('.stage-running')).toHaveLength(0)
  })

  it('marks running stage with .stage-running', () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, recall_search: 'running' },
      },
    })
    expect(wrapper.findAll('.stage-running')).toHaveLength(1)
  })

  it('marks done stages with .stage-done', () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done', recall_search: 'done' },
      },
    })
    expect(wrapper.findAll('.stage-done')).toHaveLength(2)
  })

  it('keeps sections collapsed by default; clicking a name expands/collapses it', async () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done' },
        context: { personaLen: 10, l0Count: 0, l1Count: 0, persona: '测试人格内容' },
      },
    })
    // 打开「意图」胶囊：思考 + 人格 + L0 + L1 共 4 个子项，默认全部折叠（无正文）
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    expect(wrapper.findAll('.popover-section-text')).toHaveLength(0)

    const heads = wrapper.findAll('.popover-section-head')
    expect(heads).toHaveLength(4)
    expect(heads[1].find('.popover-section-label').text()).toBe('人格')

    // 点击「人格」名称 → 展开
    await heads[1].trigger('click')
    expect(wrapper.findAll('.popover-section-text')).toHaveLength(1)
    expect(heads[1].classes()).not.toContain('popover-section-head--collapsed')
    expect(heads[1].attributes('aria-expanded')).toBe('true')

    // 再次点击 → 折叠
    await heads[1].trigger('click')
    expect(wrapper.findAll('.popover-section-text')).toHaveLength(0)
    expect(heads[1].classes()).toContain('popover-section-head--collapsed')
    expect(heads[1].attributes('aria-expanded')).toBe('false')
  })

  it('keeps expansion state isolated across capsules', async () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done', recall_search: 'done' },
        context: { personaLen: 10, l0Count: 0, l1Count: 0, persona: '测试人格内容' },
        memoryRecall: { count: 0, hits: [] },
      },
    })
    // 意图胶囊内展开「人格」（序号 1）
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    const intentHeads = wrapper.findAll('.popover-section-head')
    await intentHeads[1].trigger('click')
    expect(wrapper.findAll('.popover-section-text')).toHaveLength(1)

    // 切换到「回忆」胶囊：默认全部折叠（思考 + 召回命中仅名称行）
    await wrapper.findAll('.stage-chip')[1].trigger('click')
    expect(wrapper.findAll('.popover-section-head')).toHaveLength(2)
    expect(wrapper.findAll('.popover-section-text')).toHaveLength(0)

    // 切回「意图」胶囊：「人格」仍保持展开
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    expect(wrapper.findAll('.popover-section-text')).toHaveLength(1)
  })

  it('renders a dedicated L2 block split from mixed l1_items (legacy backend)', async () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done' },
        context: {
          personaLen: 5,
          l0Count: 0,
          l1Count: 3,
          persona: '测试人格',
          l1Items: ['[L2] 父摘要A', '[L1] 子条目B', '[L1] 子条目C'],
        },
      },
    })
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    const labels = wrapper.findAll('.popover-section-label').map((s) => s.text())
    expect(labels).toContain('L1 近期摘要')
    expect(labels).toContain('L2 会话摘要')
    const sectionByLabel = (label: string) =>
      wrapper.findAll('.popover-section').find(
        (s) => s.find('.popover-section-label').text() === label,
      )!
    // 默认折叠：先点击展开 L1 / L2 子项
    await sectionByLabel('L2 会话摘要').find('.popover-section-head').trigger('click')
    await sectionByLabel('L1 近期摘要').find('.popover-section-head').trigger('click')
    expect(sectionByLabel('L2 会话摘要').findAll('.popover-section-item').map((i) => i.text()))
      .toEqual(['[L2] 父摘要A'])
    expect(sectionByLabel('L1 近期摘要').findAll('.popover-section-item').map((i) => i.text()))
      .toEqual(['[L1] 子条目B', '[L1] 子条目C'])
  })

  it('uses structured l2_items when provided', async () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done' },
        context: {
          personaLen: 5,
          l0Count: 0,
          l1Count: 1,
          l2Count: 2,
          persona: '测试人格',
          l1Items: ['[L1] 子条目A'],
          l2Items: ['[L2] 父摘要X', '[L2] 父摘要Y'],
        },
      },
    })
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    const sectionByLabel = (label: string) =>
      wrapper.findAll('.popover-section').find(
        (s) => s.find('.popover-section-label').text() === label,
      )!
    // 默认折叠：先点击展开 L1 / L2 子项
    await sectionByLabel('L2 会话摘要').find('.popover-section-head').trigger('click')
    await sectionByLabel('L1 近期摘要').find('.popover-section-head').trigger('click')
    expect(sectionByLabel('L2 会话摘要').findAll('.popover-section-item').map((i) => i.text()))
      .toEqual(['[L2] 父摘要X', '[L2] 父摘要Y'])
    expect(sectionByLabel('L1 近期摘要').findAll('.popover-section-item').map((i) => i.text()))
      .toEqual(['[L1] 子条目A'])
  })

  // 历史消息的「意图」胶囊:thinking + context 都没从 DB 回传,
  // 不应该再渲染两条伪 placeholder ("思考（无）" + "上下文（无）"),
  // 而是合并成一条「历史消息未保存此阶段的原始数据」。
  it('意图胶囊:无 thinking + 无 context → 只渲染一条说明（历史消息场景）', async () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done' },
        // 没有 thinkings、没有 context → 模拟历史消息
      },
    })
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    const heads = wrapper.findAll('.popover-section-head')
    expect(heads).toHaveLength(1)
    expect(heads[0].find('.popover-section-label').text()).toBe('上下文')
    // 展开后只显示一条说明文字
    await heads[0].trigger('click')
    const texts = wrapper.findAll('.popover-section-text').map((t) => t.text())
    expect(texts).toHaveLength(1)
    expect(texts[0]).toBe('（历史消息未保存此阶段的原始数据）')
  })

  it('意图胶囊:有 thinking 但无 context → 渲染思考 + 上下文占位', async () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done' },
        thinkings: [{ stage: 'intent', text: '用户问天气' }],
        // 没有 context
      },
    })
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    const heads = wrapper.findAll('.popover-section-head')
    expect(heads).toHaveLength(2)
    expect(heads[0].find('.popover-section-label').text()).toBe('思考')
    expect(heads[1].find('.popover-section-label').text()).toBe('上下文')
  })

  it('意图胶囊:无 thinking 但有 context → 仍渲染 5 个块（思考占位 + 人格/L0/L1/L2）', async () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: { ...idleState, intent: 'done' },
        context: { personaLen: 5, l0Count: 0, l1Count: 0, persona: '人格' },
      },
    })
    await wrapper.findAll('.stage-chip')[0].trigger('click')
    const heads = wrapper.findAll('.popover-section-head')
    // 思考(占位)+ 人格/L0/L1 共 4 个（L2 没数据时不渲染）
    expect(heads).toHaveLength(4)
    expect(heads[0].find('.popover-section-label').text()).toBe('思考')
    expect(heads[1].find('.popover-section-label').text()).toBe('人格')
  })
})
