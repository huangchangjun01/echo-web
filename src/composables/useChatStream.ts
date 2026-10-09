import { ref, computed, onUnmounted } from 'vue'
import { sendChatMessageStream } from '@/api/chat'
import type { SendChatStreamOptions } from '@/api/chat'
import type { ChatRequest } from '@/types/chat'
import { useChatStore } from '@/stores/chat'

/**
 * useChatStream — Composable that wires SSE chat streaming to the chat store.
 *
 * Provides:
 * - `start(payload, extraOpts?)` — initiates a stream, returns the AbortController
 *   (so callers can still abort even when they ignore the `cancel` helper).
 * - `cancel()` — aborts the in-flight request via the stored AbortController.
 * - `abortController` — ref to the current controller (null when idle).
 * - `stageState` / `currentStage` — reactive proxies to the store.
 *
 * Wiring (per v2 SSE protocol):
 * - onStageStart      → setStageState(name, 'running')
 * - onStageEnd        → setStageState(name, 'done')
 * - onMoodUpdate      → setLiveMood(m)
 * - onEmotionChange   → setLiveEmotion(e)
 * - onRelationChange  → setLiveRelation(r)
 *
 * Other callbacks (onChunk / onPresence / onContext / onTool / onResource /
 * onMemory / onThinking / onRecall / onPrefix / onDone / onError) are passed
 * straight to `sendChatMessageStream` as-is. The store also subscribes to
 * these via its own SSE wiring; `extraOpts` is a thin pass-through so a
 * caller can override any of them locally if needed.
 *
 * The internal AbortController is cancelled automatically on `onUnmounted`.
 */
export function useChatStream() {
  const chat = useChatStore()
  const abortController = ref<AbortController | null>(null)

  /**
   * Reset the stage state machine so a new stream starts from a clean slate.
   * Called at the very beginning of `start()`.
   */
  function resetStages() {
    chat.resetStageState()
  }

  /**
   * Kick off an SSE stream.
   *
   * Returns the AbortController created internally; assign it to
   * `abortController.value` so callers can later `cancel()`.
   */
  function start(payload: ChatRequest, extraOpts?: Partial<SendChatStreamOptions>): AbortController {
    resetStages()
    const ctrl = new AbortController()
    abortController.value = ctrl

    const opts: SendChatStreamOptions = {
      signal: ctrl.signal,
      onStageStart: (name) =>
        chat.setStageState(name, 'running', chat.streamingMessageId ?? undefined),
      onStageEnd: (name) =>
        chat.setStageState(name, 'done', chat.streamingMessageId ?? undefined),
      onMoodUpdate: (m) => chat.setLiveMood(m),
      onEmotionChange: (e) => chat.setLiveEmotion(e),
      onRelationChange: (r) => chat.setLiveRelation(r),
      ...extraOpts,
    }

    return sendChatMessageStream(payload, opts)
  }

  /**
   * Abort the in-flight request, if any. Safe to call when no controller exists.
   */
  function cancel() {
    abortController.value?.abort()
    abortController.value = null
  }

  onUnmounted(() => cancel())

  return {
    abortController,
    start,
    cancel,
    stageState: computed(() => chat.stageState),
    currentStage: computed(() => chat.currentStage),
  }
}