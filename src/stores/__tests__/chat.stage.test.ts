import { setActivePinia, createPinia } from 'pinia'
import { useChatStore, DEFAULT_STAGE_STATE } from '@/stores/chat'
import type { ChatMoodUpdate } from '@/types/chat'
import { describe, it, expect, beforeEach } from 'vitest'

describe('chat store stage state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('setStageState updates state map', () => {
    const store = useChatStore()
    store.setStageState('intent', 'running')
    expect(store.stageState.intent).toBe('running')
    expect(store.currentStage).toBe('intent')
  })

  it('setStageState end transitions to done', () => {
    const store = useChatStore()
    store.setStageState('intent', 'running')
    store.setStageState('intent', 'done')
    expect(store.stageState.intent).toBe('done')
  })

  it('resetStageState returns to default', () => {
    const store = useChatStore()
    store.setStageState('intent', 'running')
    store.setStageState('model_reasoning', 'done')
    store.resetStageState()
    expect(store.stageState).toEqual(DEFAULT_STAGE_STATE)
    expect(store.currentStage).toBeNull()
  })

  it('live mood / emotion / relation setters', () => {
    const store = useChatStore()
    const mood: ChatMoodUpdate = {
      instantVal: 0.2,
      instantIntensity: 0.5,
      instantEmotion: 'joy',
      shortVal: 0.1,
      baselineVal: 0,
      expression: 'happy',
      valence: 0.3,
    }
    store.setLiveMood(mood)
    expect(store.liveMood).toEqual(mood)

    store.setLiveEmotion({ from: 'neutral', to: 'joy', intensity: 0.5 })
    expect(store.liveEmotion?.to).toBe('joy')

    store.setLiveRelation({ intimacy_delta: 0.02, trust_delta: 0, satisfaction_delta: 0.01, source: 'stage:answer' })
    expect(store.liveRelation?.source).toBe('stage:answer')
  })
})