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
})