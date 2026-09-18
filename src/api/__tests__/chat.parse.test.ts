import { describe, expect, it } from 'vitest'
import { parseStageEvent, parseEmotionChange, parseRelationChange } from '@/api/chat'

describe('parseStageEvent', () => {
  it('parses valid stage frame', () => {
    const got = parseStageEvent({ type: 'stage', stage: { name: 'intent', state: 'start', ts_ms: 1234 } })
    expect(got).toEqual({ name: 'intent', state: 'start', ts_ms: 1234 })
  })

  it('returns null on missing stage object', () => {
    expect(parseStageEvent({ type: 'stage' })).toBeNull()
  })

  it('returns null on wrong type', () => {
    expect(parseStageEvent({ type: 'thinking', stage: { name: 'intent', state: 'start', ts_ms: 1 } })).toBeNull()
  })

  it('returns null on invalid stage fields', () => {
    expect(parseStageEvent({ type: 'stage', stage: { name: 'intent' } })).toBeNull()
  })

  it('returns null on non-object input', () => {
    expect(parseStageEvent(null)).toBeNull()
    expect(parseStageEvent(undefined)).toBeNull()
    expect(parseStageEvent('stage')).toBeNull()
    expect(parseStageEvent(123)).toBeNull()
  })
})

describe('parseEmotionChange', () => {
  it('parses valid emotion_change frame', () => {
    const got = parseEmotionChange({ type: 'emotion_change', emotion: { from: 'neutral', to: 'joy', intensity: 0.62 } })
    expect(got).toEqual({ from: 'neutral', to: 'joy', intensity: 0.62, reason: undefined })
  })

  it('parses with optional reason', () => {
    const got = parseEmotionChange({ type: 'emotion_change', emotion: { from: 'sad', to: 'happy', intensity: 0.5, reason: 'good news' } })
    expect(got).toEqual({ from: 'sad', to: 'happy', intensity: 0.5, reason: 'good news' })
  })

  it('returns null on missing emotion object', () => {
    expect(parseEmotionChange({ type: 'emotion_change' })).toBeNull()
  })

  it('returns null on wrong type', () => {
    expect(parseEmotionChange({ type: 'thinking' })).toBeNull()
  })

  it('returns null when from/to missing', () => {
    expect(parseEmotionChange({ type: 'emotion_change', emotion: { intensity: 0.5 } })).toBeNull()
  })

  it('returns null on non-object input', () => {
    expect(parseEmotionChange(null)).toBeNull()
    expect(parseEmotionChange(undefined)).toBeNull()
    expect(parseEmotionChange('emotion_change')).toBeNull()
  })
})

describe('parseRelationChange', () => {
  it('parses valid relation_change frame', () => {
    const got = parseRelationChange({
      type: 'relation_change',
      relation: { intimacy_delta: 0.02, trust_delta: 0, satisfaction_delta: 0.01, source: 'stage:answer' },
    })
    expect(got).toEqual({ intimacy_delta: 0.02, trust_delta: 0, satisfaction_delta: 0.01, source: 'stage:answer' })
  })

  it('returns null on missing relation object', () => {
    expect(parseRelationChange({ type: 'relation_change' })).toBeNull()
  })

  it('returns null on wrong type', () => {
    expect(parseRelationChange({ type: 'thinking' })).toBeNull()
  })

  it('falls back to defaults on partial relation object', () => {
    const got = parseRelationChange({ type: 'relation_change', relation: {} })
    expect(got).toEqual({ intimacy_delta: 0, trust_delta: 0, satisfaction_delta: 0, source: '' })
  })

  it('returns null on non-object input', () => {
    expect(parseRelationChange(null)).toBeNull()
    expect(parseRelationChange(undefined)).toBeNull()
    expect(parseRelationChange('relation_change')).toBeNull()
  })
})