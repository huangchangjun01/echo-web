# 流式聊天 UX 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前单一阶段的"思考过程流式滚动 + 朴素 Markdown 渲染"升级为「5 阶段结构化进度条 + 折叠子面板 + 过程性情绪下发 + 流式心跳 + 错误传播」的三端协同 UX。

**Architecture:** 协议先行。三仓按 SSE 协议契约 v2 协同推进。echo-ai 是事件生产者，新增 5 阶段 start/end + 过程性 mood + 错误 yield；echo-core 是透明中继，补充 15s 应用层心跳 + 主动 ctx 取消 + 新 DTO 字段；echo-web 是消费者，把 3679 行 ChatPage.vue 拆为 7 个独立组件 + 1 个 useChatStream composable + 扩展 Pinia store。

**Tech Stack:** Python 3.13 (FastAPI + asyncio) / Go 1.22+ (gin) / Vue 3 + TypeScript + Pinia + Vitest

**Spec:** `docs/superpowers/specs/2026-09-16-streaming-ux-redesign-design.md`

---

## 工作流约定

- 每完成一个 Task 立即 commit
- 每完成一个 Phase 在三仓分别跑一遍对应测试
- Phase 顺序：**Phase 1 (echo-ai) → Phase 2 (echo-core) → Phase 3 (echo-web) → Phase 4 (集成联调)**
- Phase 之间**不**交叉 commit

---

## Phase 1 · echo-ai 协议层

> 工作目录: `E:\Python\workspace\echo-ai`
> 测试框架: pytest（待核实后填充）

### Task 1.1: stage 事件契约 + 单元测试

**Files:**
- Modify: `E:\Python\workspace\echo-ai\biz\chat.py`
- Create: `E:\Python\workspace\echo-ai\tests\test_chat_stream_stage_events.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_chat_stream_stage_events.py
import pytest
from biz.chat import chat_stream

@pytest.mark.asyncio
async def test_stage_events_intent_only():
    """纯意图对话应该产出 intent/answer 两个阶段，无 tool_dispatch"""
    events = []
    async for ev in chat_stream(
        user_id="u1", session_id="s1", message="hello",
        role_id="default",
    ):
        events.append(ev)
    stage_events = [e for e in events if e["type"] == "stage"]
    names = [(e["name"], e["state"]) for e in stage_events]
    assert ("intent", "start") in names
    assert ("intent", "end") in names
    assert ("model_reasoning", "start") in names
    assert ("answer", "start") in names
    assert ("answer", "end") in names
    assert ("tool_dispatch", "start") not in names  # 没工具调用应跳过
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd E:\Python\workspace\echo-ai && python -m pytest tests/test_chat_stream_stage_events.py -v`
Expected: FAIL with `stage` event not yielded

- [ ] **Step 3: 实现 stage 事件 yield**

Modify `E:\Python\workspace\echo-ai\biz\chat.py`:

```python
# 在文件顶部添加
import time

def _now_ms() -> int:
    return int(time.time() * 1000)

# 在 chat_stream 函数内部（找到 classify_intent 调用前后）插入：
yield {"type": "stage", "name": "intent", "state": "start", "ts_ms": _now_ms()}
intent = await classify_intent(message)  # 现有调用
yield {"type": "stage", "name": "intent", "state": "end", "ts_ms": _now_ms()}

# 在 L1 召回前后（如需）
if need_l1:
    yield {"type": "stage", "name": "recall_search", "state": "start", "ts_ms": _now_ms()}
    hits = await recall_l1(...)
    yield {"type": "stage", "name": "recall_search", "state": "end", "ts_ms": _now_ms()}

# 在 ReAct 每次工具调用前后
for iter in react_iters:
    yield {"type": "stage", "name": "tool_dispatch", "state": "start", "ts_ms": _now_ms()}
    result = await dispatch_tool(...)
    yield {"type": "stage", "name": "tool_dispatch", "state": "end", "ts_ms": _now_ms()}

# 小模型流前后
yield {"type": "stage", "name": "model_reasoning", "state": "start", "ts_ms": _now_ms()}
async for content, reasoning in reply_client.small_stream(...):
    ...
yield {"type": "stage", "name": "model_reasoning", "state": "end", "ts_ms": _now_ms()}

# answer 阶段（已确认从 model_reasoning.end 开始）
yield {"type": "stage", "name": "answer", "state": "start", "ts_ms": _now_ms()}
# delta 流式期间
yield {"type": "stage", "name": "answer", "state": "end", "ts_ms": _now_ms()}
yield {"type": "done", ...}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd E:\Python\workspace\echo-ai && python -m pytest tests/test_chat_stream_stage_events.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd E:\Python\workspace\echo-ai
git add biz/chat.py tests/test_chat_stream_stage_events.py
git commit -m "feat(ai): yield stage events (intent/recall/tool/reasoning/answer)"
```

### Task 1.2: 错误事件传播

**Files:**
- Modify: `E:\Python\workspace\echo-ai\llm\client.py`
- Modify: `E:\Python\workspace\echo-ai\biz\chat.py`
- Modify: `E:\Python\workspace\echo-ai\tests\test_chat_stream_stage_events.py`

- [ ] **Step 1: 写失败测试**

```python
@pytest.mark.asyncio
async def test_llm_error_yields_error_frame(monkeypatch):
    """小模型流式异常应被 yield 出去，不静默吞掉"""
    from llm import client

    async def fake_stream(*args, **kwargs):
        raise RuntimeError("simulated LLM down")
        yield  # unreachable, makes it async generator

    monkeypatch.setattr(client.AsyncOpenAI, "chat", fake_stream)

    events = []
    async for ev in chat_stream(
        user_id="u1", session_id="s1", message="hello", role_id="default"
    ):
        events.append(ev)

    error_events = [e for e in events if e["type"] == "error"]
    assert len(error_events) >= 1
    done_events = [e for e in events if e["type"] == "done"]
    assert len(done_events) == 1  # error 后仍 yield done
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 重构 small_stream 让异常可被捕获**

Modify `E:\Python\workspace\echo-ai\llm\client.py`:

```python
async def small_stream(self, messages, *, max_tokens=None, temperature=None):
    """Yield (content, reasoning, error_str). error_str 非空表示流结束。"""
    try:
        stream = await self._small_client.chat.completions.create(
            model=self.small_model,
            messages=messages,
            stream=True,
            ...
        )
        async for chunk in stream:
            content = chunk.choices[0].delta.content or ""
            reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None) or ""
            yield content, reasoning, None
    except Exception as e:
        log_exception(logger, "small_stream failed", exc=e, level=logging.WARNING)
        yield "", "", str(e)
```

Modify `E:\Python\workspace\echo-ai\biz\chat.py` 调用处：

```python
async for content, reasoning, err in reply_client.small_stream(...):
    if err is not None:
        yield {"type": "error", "error": err, "code": "llm_stream_failed"}
        break  # 跳出循环，准备 yield done
    if reasoning:
        yield {"type": "thinking", "stage": "model_reasoning", "text": reasoning}
    if content:
        ...
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(ai): propagate LLM stream errors instead of swallowing"
```

### Task 1.3: 过程性 mood 下发

**Files:**
- Modify: `E:\Python\workspace\echo-ai\character\mood.py`
- Modify: `E:\Python\workspace\echo-ai\biz\chat.py`

- [ ] **Step 1: 写失败测试**

```python
@pytest.mark.asyncio
async def test_mood_update_emitted_during_stream():
    """mood_update 应在 delta 流式期间多次 yield（不只是 done 后）"""
    events = []
    async for ev in chat_stream(
        user_id="u1", session_id="s1", message="你好呀", role_id="default"
    ):
        events.append(ev)
    mood_events = [e for e in events if e["type"] == "mood_update"]
    delta_count = sum(1 for e in events if e["type"] == "delta")
    # 长回答应触发多次 mood_update
    if delta_count > 50:
        assert len(mood_events) >= 1
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现过程性 mood**

Modify `E:\Python\workspace\echo-ai\biz\chat.py` `chat_stream` 内：

```python
# 在 small_stream 循环里增加情绪采样
delta_count = 0
async for content, reasoning, err in reply_client.small_stream(...):
    delta_count += 1
    if content:
        raw += content
        ...
        yield {"type": "delta", "text": piece}

    # 每 20 个 chunk 采一次情绪
    if delta_count % 20 == 0:
        new_mood = compute_instant(raw, ...)
        if abs(new_mood.instant_val - last_mood.instant_val) > 0.05:
            yield {"type": "mood_update", **new_mood.to_dict()}
            if new_mood.emotion != last_mood.emotion:
                yield {
                    "type": "emotion_change",
                    "from": last_mood.emotion,
                    "to": new_mood.emotion,
                    "intensity": new_mood.intensity,
                }
            last_mood = new_mood
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(ai): emit mood updates during delta streaming"
```

---

## Phase 2 · echo-core 中继层

> 工作目录: `E:\Go\work-self\workspace\echo-core`
> 测试框架: Go 标准库 `testing`（项目 go.mod 未引入 testify，沿用 `t.Run` 表格驱动风格）

### Task 2.1: DTO 新增 stage / emotion / relation 类型

**Files:**
- Modify: `E:\Go\work-self\workspace\echo-core\dto\chat_dto.go`
- Test: `E:\Go\work-self\workspace\echo-core\dto\chat_dto_test.go` (new)

- [ ] **Step 1: 写失败测试**

```go
package dto

import (
    "encoding/json"
    "testing"
)

func TestChatEvent_StageEvent_Marshaling(t *testing.T) {
    cases := []struct {
        name    string
        ev      ChatEvent
        wantKey string
        wantVal string
    }{
        {
            name: "stage event",
            ev: ChatEvent{
                Type: "stage",
                Stage: &StageEvent{Name: "intent", State: "start", TsMs: 1737038400123},
            },
            wantKey: "name",
            wantVal: "intent",
        },
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            data, err := json.Marshal(tc.ev)
            if err != nil {
                t.Fatalf("marshal: %v", err)
            }
            var got map[string]any
            if err := json.Unmarshal(data, &got); err != nil {
                t.Fatalf("unmarshal: %v", err)
            }
            stage, ok := got["stage"].(map[string]any)
            if !ok {
                t.Fatalf("stage field missing in %s", string(data))
            }
            if stage[tc.wantKey] != tc.wantVal {
                t.Errorf("stage.%s=%v, want %s", tc.wantKey, stage[tc.wantKey], tc.wantVal)
            }
        })
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd E:\Go\work-self\workspace\echo-core && go test ./dto/...`

- [ ] **Step 3: 实现新类型**

```go
package dto

type StageEvent struct {
    Name  string `json:"name"`
    State string `json:"state"`
    TsMs  int64  `json:"ts_ms"`
}

type EmotionChange struct {
    From      string  `json:"from"`
    To        string  `json:"to"`
    Intensity float64 `json:"intensity"`
    Reason    string  `json:"reason,omitempty"`
}

type RelationChange struct {
    IntimacyDelta     float64 `json:"intimacy_delta"`
    TrustDelta        float64 `json:"trust_delta"`
    SatisfactionDelta float64 `json:"satisfaction_delta"`
    Source            string  `json:"source"`
}

// ChatEvent 增加字段
type ChatEvent struct {
    Type      string          `json:"type"`
    // ... 现有字段保留 ...
    Stage     *StageEvent     `json:"stage,omitempty"`
    Mood      *MoodUpdate     `json:",omitempty"`        // 已存在
    Emotion   *EmotionChange  `json:"emotion,omitempty"`
    Relation  *RelationChange `json:"relation,omitempty"`
}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git add dto/chat_dto.go dto/chat_dto_test.go
git commit -m "feat(core): add StageEvent/EmotionChange/RelationChange DTOs"
```

### Task 2.2: 15s 应用层心跳

**Files:**
- Modify: `E:\Go\work-self\workspace\echo-core\handlers\chat_stream_handler.go`

- [ ] **Step 1: 写失败测试**

```go
// handlers/chat_stream_handler_test.go
package handlers

import (
    "context"
    "net/http/httptest"
    "strings"
    "testing"
    "time"
)

func TestStreamResponse_EmitsHeartbeat(t *testing.T) {
    // 模拟一个会 hang 住的 Python stream，每秒 yield 一条事件但要等够 15s+ 才能验证心跳
    // 简化：直接调 writeSSEHeartbeat 验证格式
    w := httptest.NewRecorder()
    flusher, ok := w.(http.Flusher)
    if !ok {
        t.Fatal("response writer must support Flusher")
    }
    writeSSEHeartbeat(w, flusher, time.Now().UnixMilli())
    body := w.Body.String()
    if !strings.HasPrefix(body, ": ping ") {
        t.Errorf("heartbeat format wrong: %q", body)
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现心跳辅助函数 + 集成到 streamResponse**

```go
// 在 chat_stream_handler.go 内
func writeSSEHeartbeat(w io.Writer, f http.Flusher, tsMs int64) error {
    if _, err := fmt.Fprintf(w, ": ping %d\n\n", tsMs); err != nil {
        return err
    }
    f.Flush()
    return nil
}

// 在 streamResponse 内（替换现有 progressTicker 占位）：
heartbeatTicker := time.NewTicker(15 * time.Second)
defer heartbeatTicker.Stop()

for {
    select {
    case <-ctx.Done():
        // 客户端断开
        return
    case <-heartbeatTicker.C:
        if err := writeSSEHeartbeat(c.Writer, flusher, time.Now().UnixMilli()); err != nil {
            return
        }
    case ev, ok := <-eventCh:
        if !ok {
            return
        }
        // 写正常 SSE 帧（沿用现有 writeSSEEvent 逻辑）
        ...
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): 15s application-layer SSE heartbeat"
```

### Task 2.3: 客户端断开 → 取消 Python 请求

**Files:**
- Modify: `E:\Go\work-self\workspace\echo-core\remote\python_chat_client.go`
- Modify: `E:\Go\work-self\workspace\echo-core\handlers\chat_stream_handler.go`

- [ ] **Step 1: 写失败测试**

```go
func TestPythonChatClient_CancelOnContextDone(t *testing.T) {
    // 启动一个 mock Python 服务，故意 hang 住
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "text/event-stream")
        w.WriteHeader(200)
        if f, ok := w.(http.Flusher); ok {
            f.Flush()
        }
        <-r.Context().Done()  // 阻塞直到客户端断开
    }))
    defer srv.Close()

    client := NewPythonChatClient(srv.URL, 30*time.Second)
    ctx, cancel := context.WithCancel(context.Background())
    errCh := make(chan error, 1)
    go func() {
        _, err := client.ChatStreamEvents(ctx, PythonChatRequest{...})
        errCh <- err
    }()
    time.Sleep(100 * time.Millisecond)
    cancel()  // 触发取消

    select {
    case err := <-errCh:
        if err == nil {
            t.Fatal("expected error after cancel")
        }
    case <-time.After(3 * time.Second):
        t.Fatal("did not return after cancel")
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现 ctx 取消**

```go
func (c *PythonChatClient) ChatStreamEvents(ctx context.Context, req PythonChatRequest, onEvent func(dto.ChatEvent) error) error {
    streamCtx, cancel := context.WithCancel(ctx)
    c.cancelFn = cancel
    defer func() { c.cancelFn = nil }()

    httpReq, err := http.NewRequestWithContext(streamCtx, "POST", c.baseURL+"/chat", body)
    ...
    resp, err := c.httpClient.Do(httpReq)
    if err != nil {
        return fmt.Errorf("python chat request failed: %w", err)
    }
    defer resp.Body.Close()
    ...
}
```

`ChatHandler.streamResponse` 在 `ctx.Done()` 分支调用 `client.CancelStream(...)`。

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(core): cancel python HTTP request on client disconnect"
```

---

## Phase 3 · echo-web 前端

> 工作目录: `E:\FE\work-self\workspace\echo-web`
> 测试框架: vitest + @vue/test-utils（项目已配 `vitest.config.ts` + `jsdom` + `pinia`，但 `src/**` 下尚无 .spec.ts，按本计划建立；`npm test` 跑 vitest run + 既有 `test/*.test.mjs`）
> E2E: 项目未安装 playwright，需新增：`pnpm add -D @playwright/test`，并在 `tests/e2e/` 下放 spec

### Task 3.1: 类型定义扩展

**Files:**
- Modify: `E:\FE\work-self\workspace\echo-web\src\types\chat.ts`

- [ ] **Step 1: 新增类型**

```typescript
export type StageName = 'intent' | 'recall_search' | 'tool_dispatch' | 'model_reasoning' | 'answer'
export type StageState = 'idle' | 'running' | 'done' | 'skipped'

export interface StageEvent {
  name: StageName
  state: 'start' | 'end'
  ts_ms: number
}

export interface EmotionChange {
  from: string
  to: string
  intensity: number
  reason?: string
}

export interface RelationChange {
  intimacy_delta: number
  trust_delta: number
  satisfaction_delta: number
  source: string
}

export interface ChatMessage {
  // ... 现有字段
  stageState?: Record<StageName, StageState>
}
```

- [ ] **Step 2: TypeScript 编译验证**

Run: `cd E:\FE\work-self\workspace\echo-web && pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): add StageName/StageState/StageEvent types"
```

### Task 3.2: SSE 解析新增 stage / emotion_change / relation_change；删除 parsePrefix

**Files:**
- Modify: `E:\FE\work-self\workspace\echo-web\src\api\chat.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/api/__tests__/chat.parse.test.ts
import { describe, expect, it } from 'vitest'
import { parseStageEvent, parseEmotionChange, parseRelationChange } from '@/api/chat'

describe('parseStageEvent', () => {
  it('parses valid stage frame', () => {
    const got = parseStageEvent({ type: 'stage', stage: { name: 'intent', state: 'start', ts_ms: 1234 } })
    expect(got).toEqual({ name: 'intent', state: 'start', ts_ms: 1234 })
  })
  it('returns null on invalid', () => {
    expect(parseStageEvent({ type: 'stage' })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现 parser + 扩展 ChatCallbacks**

```typescript
// api/chat.ts

export interface ChatCallbacks {
  // ... 现有回调
  onStageStart?: (name: StageName) => void
  onStageEnd?: (name: StageName) => void
  onMoodUpdate?: (m: ChatMoodUpdate) => void
  onEmotionChange?: (e: EmotionChange) => void
  onRelationChange?: (r: RelationChange) => void
}

export function parseStageEvent(raw: unknown): StageEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as any
  if (r.type !== 'stage') return null
  const stage = r.stage
  if (!stage || typeof stage.name !== 'string' || typeof stage.state !== 'string') return null
  return { name: stage.name, state: stage.state, ts_ms: Number(stage.ts_ms) || 0 }
}

export function parseEmotionChange(raw: unknown): EmotionChange | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as any
  if (r.type !== 'emotion_change') return null
  const e = r.emotion
  if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') return null
  return { from: e.from, to: e.to, intensity: Number(e.intensity) || 0, reason: e.reason }
}

export function parseRelationChange(raw: unknown): RelationChange | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as any
  if (r.type !== 'relation_change') return null
  const rel = r.relation
  if (!rel) return null
  return {
    intimacy_delta: Number(rel.intimacy_delta) || 0,
    trust_delta: Number(rel.trust_delta) || 0,
    satisfaction_delta: Number(rel.satisfaction_delta) || 0,
    source: String(rel.source ?? ''),
  }
}
```

并在 `handleFrame` switch 增加 3 个 case：

```typescript
case 'stage': {
  const ev = parseStageEvent(raw)
  if (ev) {
    if (ev.state === 'start') opts.onStageStart?.(ev.name)
    else opts.onStageEnd?.(ev.name)
  }
  break
}
case 'emotion_change': {
  const ev = parseEmotionChange(raw)
  if (ev) opts.onEmotionChange?.(ev)
  break
}
case 'relation_change': {
  const ev = parseRelationChange(raw)
  if (ev) opts.onRelationChange?.(ev)
  break
}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 删除 parsePrefix（保留 no-op 占位也行，标 deprecated）**

```typescript
/** @deprecated 历史事件，前端不再处理。保留解析以兼容旧后端。 */
export function parsePrefix(raw: unknown): string | null {
  return null
}
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(web): parse stage/emotion_change/relation_change SSE frames"
```

### Task 3.3: Pinia store 扩展 stageState / liveMood / liveRelation

**Files:**
- Modify: `E:\FE\work-self\workspace\echo-web\src\stores\chat.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/stores/__tests__/chat.stage.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { useChatStore } from '@/stores/chat'
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
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 扩展 store**

```typescript
import { defineStore } from 'pinia'
import type { StageName, StageState, EmotionChange, RelationChange } from '@/types/chat'

/** 兜底 stage 状态：所有阶段都 idle */
export const DEFAULT_STAGE_STATE: Record<StageName, StageState> = {
  intent: 'idle',
  recall_search: 'idle',
  tool_dispatch: 'idle',
  model_reasoning: 'idle',
  answer: 'idle',
}

export const useChatStore = defineStore('chat', () => {
  // ... 现有 state
  
  const stageState = ref<Record<StageName, StageState>>({ ...DEFAULT_STAGE_STATE })
  const currentStage = ref<StageName | null>(null)
  const liveMood = ref<ChatMoodUpdate | null>(null)
  const liveEmotion = ref<EmotionChange | null>(null)
  const liveRelation = ref<RelationChange | null>(null)

  function setStageState(name: StageName, state: StageState) {
    stageState.value[name] = state
    if (state === 'running') currentStage.value = name
  }
  
  function resetStageState() {
    stageState.value = { ...DEFAULT_STAGE_STATE }
    currentStage.value = null
  }
  
  function setLiveMood(m: ChatMoodUpdate) { liveMood.value = m }
  function setLiveEmotion(e: EmotionChange) { liveEmotion.value = e }
  function setLiveRelation(r: RelationChange) { liveRelation.value = r }

  return {
    // ... 现有返回
    stageState, currentStage, liveMood, liveEmotion, liveRelation,
    setStageState, resetStageState, setLiveMood, setLiveEmotion, setLiveRelation,
  }
})
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): extend chat store with stage state and live mood"
```

### Task 3.4: useChatStream composable

**Files:**
- Create: `E:\FE\work-self\workspace\echo-web\src\composables\useChatStream.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/composables/__tests__/useChatStream.test.ts
import { describe, it, expect, vi } from 'vitest'
import { useChatStream } from '@/composables/useChatStream'

describe('useChatStream', () => {
  it('starts with idle stages', () => {
    const { stageState, currentStage } = useChatStream()
    expect(stageState.value.intent).toBe('idle')
    expect(currentStage.value).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现 composable**

```typescript
import { ref, onUnmounted } from 'vue'
import { sendChatMessageStream, type ChatRequest, type ChatCallbacks } from '@/api/chat'
import { useChatStore } from '@/stores/chat'
import type { StageName } from '@/types/chat'

export function useChatStream() {
  const chat = useChatStore()
  const abortController = ref<AbortController | null>(null)
  
  function resetStages() {
    chat.resetStageState()
  }

  async function start(payload: ChatRequest) {
    resetStages()
    const ctrl = new AbortController()
    abortController.value = ctrl
    return sendChatMessageStream(payload, {
      signal: ctrl.signal,
      onStageStart: (name) => chat.setStageState(name, 'running'),
      onStageEnd: (name) => chat.setStageState(name, 'done'),
      onMoodUpdate: (m) => chat.setLiveMood(m),
      onEmotionChange: (e) => chat.setLiveEmotion(e),
      onRelationChange: (r) => chat.setLiveRelation(r),
      // ... 其他回调
    })
  }

  function cancel() {
    abortController.value?.abort()
    abortController.value = null
  }

  onUnmounted(() => cancel())

  return { abortController, start, cancel }
}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): add useChatStream composable"
```

### Task 3.5: StageProgress.vue 组件

**Files:**
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\StageProgress.vue`
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\__tests__\StageProgress.spec.ts`

- [ ] **Step 1: 写失败快照测试**

```typescript
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import StageProgress from '@/components/chat/StageProgress.vue'

describe('StageProgress', () => {
  it('renders 5 chips', () => {
    const wrapper = mount(StageProgress, {
      props: {
        stageState: {
          intent: 'done', recall_search: 'running', tool_dispatch: 'idle',
          model_reasoning: 'idle', answer: 'idle',
        },
      },
    })
    expect(wrapper.findAll('.stage-chip')).toHaveLength(5)
    expect(wrapper.findAll('.stage-running')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现组件**

```vue
<!-- StageProgress.vue -->
<script setup lang="ts">
import type { StageName, StageState } from '@/types/chat'

const props = defineProps<{ stageState: Record<StageName, StageState> }>()

const STAGES: { name: StageName; label: string; emoji: string }[] = [
  { name: 'intent', label: '意图', emoji: '🌸' },
  { name: 'recall_search', label: '回忆', emoji: '🌸' },
  { name: 'tool_dispatch', label: '工具', emoji: '🌸' },
  { name: 'model_reasoning', label: '推理', emoji: '🌸' },
  { name: 'answer', label: '回答', emoji: '🌸' },
]

function iconFor(name: StageName, state: StageState): string {
  if (state === 'done') return '✓'
  if (state === 'running') return '●'
  if (state === 'skipped') return '–'
  return STAGES.find(s => s.name === name)!.emoji
}
</script>

<template>
  <div class="stage-progress">
    <div
      v-for="stage in STAGES"
      :key="stage.name"
      :class="['stage-chip', `stage-${props.stageState[stage.name]}`]"
    >
      <span class="stage-icon">{{ iconFor(stage.name, props.stageState[stage.name]) }}</span>
      <span class="stage-label">{{ stage.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage-progress { display: flex; gap: 4px; margin-bottom: 12px; }
.stage-chip {
  flex: 1; font-size: 11px; padding: 7px 4px; border-radius: 999px;
  text-align: center; transition: background-color .3s, color .3s, box-shadow .3s;
}
.stage-chip.stage-idle { background: rgba(255,255,255,0.5); color: #d4a78a; }
.stage-chip.stage-running {
  background: #ff8a65; color: #fff; font-weight: 600;
  box-shadow: 0 0 0 4px rgba(255,138,102,0.25);
  animation: stagePulse 1.4s infinite;
}
.stage-chip.stage-done { background: #4ade80; color: #fff; }
.stage-chip.stage-skipped { background: rgba(0,0,0,0.06); color: #c4a78a; }
@keyframes stagePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,138,102,0.4); }
  50% { box-shadow: 0 0 0 6px rgba(255,138,102,0.15); }
}
</style>
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): add StageProgress component (5-stage chip bar)"
```

### Task 3.6: ThoughtPanel / ToolCallsPanel / ResourcesPanel 三个折叠面板

**Files:**
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\ThoughtPanel.vue`
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\ToolCallsPanel.vue`
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\ResourcesPanel.vue`
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\subpanel-shared.css`

- [ ] **Step 1: 实现 ThoughtPanel.vue**

```vue
<!-- ThoughtPanel.vue -->
<script setup lang="ts">
import type { ChatThinkingEvent } from '@/types/chat'

const props = defineProps<{
  thinkings: ChatThinkingEvent[]
  defaultOpen: boolean
  streamingText?: string
}>()

const isOpen = ref(props.defaultOpen)
watch(() => props.defaultOpen, v => { isOpen.value = v })

const reasoningText = computed(() =>
  props.streamingText
  || props.thinkings
    .filter(t => t.stage === 'model_reasoning')
    .map(t => t.text)
    .join('\n\n'),
)

const durationLabel = computed(() => {
  if (props.streamingText) return '实时'
  const ts = props.thinkings.find(t => t.ts_ms)?.ts_ms
  return ts ? new Date(ts).toLocaleTimeString() : ''
})
</script>

<template>
  <details class="chat-subpanel thought-panel" :open="isOpen">
    <summary @click.prevent="isOpen = !isOpen">
      <span class="subpanel-icon">💭</span>
      思考过程 <span class="subpanel-meta">· {{ durationLabel }}</span>
    </summary>
    <div class="subpanel-body">{{ reasoningText }}</div>
  </details>
</template>

<style scoped>
.thought-panel .subpanel-body {
  font-style: italic; color: #a06a4a; line-height: 1.6;
}
</style>
```

- [ ] **Step 2: 实现 ToolCallsPanel.vue**（蓝绿系，icon 🛠️）

```vue
<!-- ToolCallsPanel.vue -->
<script setup lang="ts">
import type { ChatToolCall } from '@/types/chat'

const props = defineProps<{
  toolCalls: ChatToolCall[]
  defaultOpen: boolean
}>()
const isOpen = ref(props.defaultOpen)
watch(() => props.defaultOpen, v => { isOpen.value = v })
</script>

<template>
  <details class="chat-subpanel tool-panel" :open="isOpen">
    <summary @click.prevent="isOpen = !isOpen">
      <span class="subpanel-icon" style="color:#10b981;">🛠️</span>
      调用工具 <span class="subpanel-meta">· {{ toolCalls.length }} 次</span>
    </summary>
    <div class="subpanel-body">
      <div v-for="tc in toolCalls" :key="`${tc.name}-${tc.iter}`" class="tool-item">
        <span :class="['tool-status', tc.ok ? 'ok' : 'fail']">{{ tc.ok ? '✓' : '✗' }}</span>
        <strong>{{ tc.name }}</strong>
        <span class="tool-summary">{{ tc.summary }}</span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.tool-panel .subpanel-body { color: #065f46; }
.tool-item { margin-bottom: 6px; display: flex; gap: 6px; align-items: baseline; }
.tool-status.ok { color: #10b981; }
.tool-status.fail { color: #ef4444; }
.tool-summary { color: #a06a4a; font-size: 11px; }
</style>
```

- [ ] **Step 3: 实现 ResourcesPanel.vue**（紫色，icon 📎）

```vue
<!-- ResourcesPanel.vue -->
<script setup lang="ts">
import type { ChatAttachment } from '@/types/chat'

const props = defineProps<{
  resources: ChatAttachment[]
  defaultOpen: boolean
}>()
const isOpen = ref(props.defaultOpen)
watch(() => props.defaultOpen, v => { isOpen.value = v })

function iconFor(modality: string): string {
  if (modality === 'image') return '🖼️'
  if (modality === 'document') return '📄'
  return '📎'
}
</script>

<template>
  <details class="chat-subpanel resource-panel" :open="isOpen">
    <summary @click.prevent="isOpen = !isOpen">
      <span class="subpanel-icon" style="color:#8b5cf6;">📎</span>
      引用资源 <span class="subpanel-meta">· {{ resources.length }} 个</span>
    </summary>
    <div class="subpanel-body">
      <div v-for="r in resources" :key="r.file_id + r.chunk_index" class="resource-item">
        <span>{{ iconFor(r.modality ?? '') }}</span>
        <strong>{{ r.display_name || r.name || r.file_id }}</strong>
        <span v-if="r.similarity" class="resource-meta">相似度 {{ r.similarity.toFixed(2) }}</span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.resource-panel .subpanel-body { color: #5b21b6; }
.resource-item { margin-bottom: 4px; display: flex; gap: 6px; align-items: baseline; }
.resource-meta { color: #a06a4a; font-size: 11px; }
</style>
```

- [ ] **Step 4: 抽公共样式**

`src/components/chat/subpanel-shared.css`：

```css
.chat-subpanel {
  margin-top: 8px;
  background: rgba(255,200,180,0.12);
  border-radius: 10px;
  font-size: 12px;
  color: #a05a3a;
}
.chat-subpanel summary {
  cursor: pointer; padding: 10px 14px; list-style: none;
  display: flex; align-items: center; gap: 6px;
}
.chat-subpanel summary::marker { display: none; }
.chat-subpanel .subpanel-meta { color: #d4a78a; }
.chat-subpanel .subpanel-body { padding: 0 14px 12px; }
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ThoughtPanel.vue src/components/chat/ToolCallsPanel.vue src/components/chat/ResourcesPanel.vue src/components/chat/subpanel-shared.css
git commit -am "feat(web): add ThoughtPanel/ToolCallsPanel/ResourcesPanel"
```

### Task 3.7: MessageActions.vue（复制 / 朗读 / 👍 / 👎）

**Files:**
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\MessageActions.vue`

- [ ] **Step 1: 实现组件**

```vue
<script setup lang="ts">
import type { ChatMessage } from '@/types/chat'

const props = defineProps<{ message: ChatMessage }>()
const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'tts'): void
  (e: 'feedback', value: 'up' | 'down'): void
}>()

async function copy() {
  await navigator.clipboard.writeText(props.message.content)
  emit('copy')
}
</script>

<template>
  <div class="message-actions">
    <button class="action-btn" @click="copy" title="复制">📋</button>
    <button class="action-btn" @click="emit('tts')" title="朗读">🔊</button>
    <button class="action-btn" @click="emit('feedback', 'up')" title="赞">👍</button>
    <button class="action-btn" @click="emit('feedback', 'down')" title="踩">👎</button>
  </div>
</template>

<style scoped>
.message-actions { display: flex; gap: 8px; margin-top: 6px; font-size: 11px; color: #d4a78a; }
.action-btn { background: none; border: none; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
.action-btn:hover { background: rgba(255,200,180,0.2); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(web): add MessageActions (copy/tts/feedback)"
```

### Task 3.8: ChatMarkdown.vue（封装 renderMarkdown + 节流）

**Files:**
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\ChatMarkdown.vue`

- [ ] **Step 1: 实现组件（rAF 节流）**

```vue
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{ source: string }>()
const rendered = ref('')

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

// rAF 节流
let rafId: number | null = null
let pending = ''
watch(() => props.source, (v) => {
  pending = v
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rendered.value = renderMarkdown(pending)
    rafId = null
  })
}, { immediate: true })

onUnmounted(() => { if (rafId !== null) cancelAnimationFrame(rafId) })
</script>

<template>
  <div class="chat-markdown" v-html="rendered" />
</template>

<style scoped>
.chat-markdown :deep(code) {
  background: rgba(255,200,180,0.3);
  padding: 1px 5px; border-radius: 4px; font-size: 12px;
}
.chat-markdown :deep(pre) {
  background: rgba(0,0,0,0.05); padding: 10px; border-radius: 8px; overflow-x: auto;
}
.chat-markdown :deep(strong) { color: #ff8a65; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(web): add ChatMarkdown with rAF throttle"
```

### Task 3.9: StreamingBubble.vue（聚合组件）

**Files:**
- Create: `E:\FE\work-self\workspace\echo-web\src\components\chat\StreamingBubble.vue`

- [ ] **Step 1: 实现组件**

```vue
<script setup lang="ts">
import type { ChatMessage } from '@/types/chat'
import { DEFAULT_STAGE_STATE } from '@/stores/chat'
import StageProgress from './StageProgress.vue'
import ThoughtPanel from './ThoughtPanel.vue'
import ToolCallsPanel from './ToolCallsPanel.vue'
import ResourcesPanel from './ResourcesPanel.vue'
import MessageActions from './MessageActions.vue'
import ChatMarkdown from './ChatMarkdown.vue'

const props = defineProps<{
  message: ChatMessage
  isStreaming: boolean
  streamingReasoning?: string
}>()

const hasAnyPanel = computed(() =>
  (props.message.thinkings?.length ?? 0) > 0
  || (props.message.toolCalls?.length ?? 0) > 0
  || (props.message.attachments?.length ?? 0) > 0
)
</script>

<template>
  <div class="streaming-bubble">
    <StageProgress
      v-if="isStreaming || hasAnyPanel"
      :stage-state="message.stageState ?? DEFAULT_STAGE_STATE"
    />
    <ChatMarkdown :source="message.content" />
    <ThoughtPanel
      v-if="message.thinkings?.length"
      :thinkings="message.thinkings"
      :default-open="isStreaming"
      :streaming-text="streamingReasoning"
    />
    <ToolCallsPanel
      v-if="message.toolCalls?.length"
      :tool-calls="message.toolCalls"
      :default-open="isStreaming"
    />
    <ResourcesPanel
      v-if="message.attachments?.length"
      :resources="message.attachments"
      :default-open="isStreaming"
    />
    <MessageActions v-if="!isStreaming" :message="message" />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(web): add StreamingBubble aggregate component"
```

### Task 3.10: ChatPage.vue 重构（替换原内联实现）

**Files:**
- Modify: `E:\FE\work-self\workspace\echo-web\src\views\chat\ChatPage.vue`

- [ ] **Step 1: 用 useChatStream + StreamingBubble 替换原 1200+ 行 handleSend**

```typescript
// src/views/chat/ChatPage.vue（关键部分）
<script setup lang="ts">
import { useChatStream } from '@/composables/useChatStream'
import StreamingBubble from '@/components/chat/StreamingBubble.vue'
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()
const { start } = useChatStream()

async function handleSend(text: string) {
  if (chat.isStreaming) return
  const userMsg = chat.appendUserMessage(text)
  const assistantMsg = chat.appendAssistantPlaceholder()
  chat.isStreaming = true
  chat.streamingMessageId = assistantMsg.id

  try {
    await start({
      model: chat.selectedModel,
      userId: chat.userId,
      sessionId: chat.sessionId,
      roleId: rolesStore.currentRoleId || 'default',
      message: text,
    })
  } finally {
    chat.isStreaming = false
    chat.streamingMessageId = null
  }
}
</script>

<template>
  <div class="chat-page">
    <!-- ... 历史侧栏 ... -->
    <div class="messages-inner">
      <div v-for="msg in chat.currentSession?.messages" :key="msg.id" :class="['message', msg.role]">
        <StreamingBubble
          :message="msg"
          :is-streaming="msg.id === chat.streamingMessageId"
          :streaming-reasoning="msg.id === chat.streamingMessageId ? streamingReasoningText : ''"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 删除 ChatPage.vue 内联的 renderMarkdown、typewriter、scrollToBottom 等（迁移到组件 / composable）**

- [ ] **Step 3: 运行前端全量测试**

Run: `cd E:\FE\work-self\workspace\echo-web && pnpm test`
Expected: PASS

- [ ] **Step 4: e2e 验证（playwright）**

Run: `pnpm test:e2e`
Expected: 流式聊天气泡 + 阶段条 + 折叠面板全部按预期渲染

- [ ] **Step 5: 验证 ChatPage.vue 行数**

Run: `wc -l src/views/chat/ChatPage.vue`
Expected: < 500 行

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor(web): replace ChatPage inline impl with StreamingBubble"
```

---

## Phase 4 · 三端联调

### Task 4.1: 启动三端、curl 验证 SSE 流

- [ ] **Step 1: 启动 echo-ai**

```bash
cd E:\Python\workspace\echo-ai && python run.py
```

- [ ] **Step 2: 启动 echo-core（指向本地 echo-ai）**

```bash
cd E:\Go\work-self\workspace\echo-core && ECHO_AI_REMOTE_BASE_URL=http://localhost:8000 go run .
```

- [ ] **Step 3: curl 触发一次对话，捕获 SSE 流**

```bash
curl -N -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: test-session" \
  -d '{"userId":"u1","sessionId":"test","roleId":"default","message":"你好","stream":true}'
```

Expected output:
- `event: presence\ndata: {"type":"presence","text":"嗯，我在听~"}\n\n`
- `event: stage\ndata: {"type":"stage","name":"intent","state":"start",...}\n\n`
- `event: stage\ndata: {"type":"stage","name":"intent","state":"end",...}\n\n`
- ... 多条 stage 事件
- `event: delta\ndata: {...}\n\n` (多次)
- `event: done\ndata: {...}\n\n`
- 静默 15s 后出现 `: ping ...\n\n` 心跳帧

- [ ] **Step 4: 启动 echo-web，浏览器交互验证 UI**

```bash
cd E:\FE\work-self\workspace\echo-web && pnpm dev
```

Expected:
- 阶段进度条随 AI 状态更新
- 折叠面板在流式中展开，完成后折叠
- 操作行复制成功、朗读按钮触发 TTS
- 关闭浏览器 tab 后，echo-core 日志显示「客户端断开」并取消 Python 请求

### Task 4.2: 错误路径验证

- [ ] **Step 1: 模拟 echo-ai 异常**

```bash
# 临时把 echo-ai 的 LLM_API_KEY 改坏
LLM_API_KEY=invalid python run.py
```

- [ ] **Step 2: curl 触发对话，确认 SSE 流包含 error 帧 + done 帧**

Expected:
- `event: error\ndata: {"type":"error","error":"...","code":"llm_stream_failed"}\n\n`
- `event: done\ndata: {"type":"done","full":""}\n\n`

- [ ] **Step 3: 浏览器端验证 toast 提示 + 消息标记为失败**

- [ ] **Step 4: 恢复配置**

### Task 4.3: 心跳验证

- [ ] **Step 1: 让 echo-ai 进入慢路径（debug sleep 30s）**

- [ ] **Step 2: curl 监听 SSE 流 60s，确认 15s 间隔出现 `: ping` 帧**

- [ ] **Step 3: 移除 debug sleep**

---

## 总览时间估算

| Phase | 任务 | 估计 |
|---|---|---|
| Phase 1 (echo-ai) | 3 任务 | 1-2 天 |
| Phase 2 (echo-core) | 3 任务 | 0.5-1 天 |
| Phase 3 (echo-web) | 10 任务 | 3-5 天 |
| Phase 4 (联调) | 3 任务 | 1-2 天 |
| **合计** | **19 任务** | **1-2 周** |

---

## 完成定义

- [ ] 三仓单元测试全过
- [ ] Phase 4 端到端 4 个验证场景全过
- [ ] ChatPage.vue < 500 行
- [ ] SSE 帧 schema 与 spec §3.2 完全一致
- [ ] B 风格视觉与 mockup `full-message.html` 一致
- [ ] 5 阶段进度条 / 折叠子面板 / 操作行 / 阶段心跳 / 错误传播全部可用