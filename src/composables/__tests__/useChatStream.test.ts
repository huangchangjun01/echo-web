import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatStream } from '@/composables/useChatStream'

describe('useChatStream', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('exposes stage state and currentStage from store', () => {
    const { stageState, currentStage } = useChatStream()
    expect(stageState.value.intent).toBe('idle')
    expect(currentStage.value).toBeNull()
  })

  it('cancel aborts in-flight controller', () => {
    const { abortController, cancel } = useChatStream()
    expect(abortController.value).toBeNull()
    cancel() // should be safe when no controller
    expect(abortController.value).toBeNull()
  })
})