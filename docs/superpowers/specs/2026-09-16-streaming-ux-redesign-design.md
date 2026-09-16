# 流式聊天 UX 重构设计文档

> 状态: **草案 — 待用户审阅**
> 日期: 2026-09-16
> 范围: 三端联动（echo-web / echo-core / echo-ai）
> 工作分支: 暂未开，建议每仓一个 feature 分支

---

## 1. 背景与目标

### 1.1 问题陈述

当前流式聊天的思考过程呈现和结果呈现都存在结构性缺陷：

- **思考过程**：用户只看到 `model_reasoning` 一种 stage 的纯文本流式滚动，看不到「AI 在做什么」的阶段性进展。
- **结果呈现**：渲染走 ChatPage.vue 内联的自写 7 种语法正则，O(N²) 性能，长文流式会卡顿；XSS 风险未完全消除。
- **过程感缺失**：工具调用、资源引用、心情/关系值变化都集中在 `done` 之后才出现，用户感受不到 AI「正在工作」。
- **流式鲁棒性**：echo-core 心跳是占位（`progressTicker` 从未被驱动）；echo-ai 小模型流式异常会吞掉导致前端永远挂着。
- **架构老化**：ChatPage.vue 3679 行单文件承担 6 个关注点；`useChatStore` 与流式订阅解耦不清晰。

### 1.2 目标

| 维度 | 目标 |
|---|---|
| 思考呈现 | 用户在 AI 工作过程中能看清「意图→回忆→工具→推理→回答」五阶段进展 |
| 结果呈现 | 主答案清晰可读，工具/资源以折叠子面板藏在气泡内，默认按流式状态切换展开/折叠 |
| 过程感 | 工具调用、资源引用在流式过程中逐步出现（而非 done 后才汇总） |
| 鲁棒性 | 长流式不因 proxy 切断、AI 异常不导致前端永远挂起 |
| 可维护性 | ChatPage.vue 拆分为独立组件 / composable，单文件 < 500 行 |
| 协议 | SSE 协议补全（阶段事件 + 心跳 + 错误传播 + 过程性情绪） |

### 1.3 非目标

- 不引入 markdown-it / marked 等大依赖（保留自写 7 种语法）
- 不做公式渲染、Mermaid 图表
- 不重写 ChatPage.vue 之外的非流式相关组件
- 不做音色 / 像素人物等其它模式的重构

---

## 2. 架构与数据流

### 2.1 改造前

```
echo-web ──fetch+手工 SSE──▶ echo-core ──HTTP SSE──▶ echo-ai ──OpenAI stream──▶ LLM
   ChatPage.vue (3679行)        透传                 业务编排 + yield events
```

### 2.2 改造后

```
echo-web                              echo-core                       echo-ai
┌──────────────────┐                  ┌──────────────┐                ┌──────────────────┐
│ useChatStream    │  POST /api/chat  │ ChatHandler  │  POST /chat   │ chat_stream      │
│  (composable)    │ ───────────────▶ │ + 心跳 15s   │ ────────────▶ │ + 阶段 start/end │
│                  │ ◀─── SSE ─────── │ + 透传 + log │ ◀── SSE ───── │ + 错误 yield     │
│ 组件：            │                  └──────────────┘                │ + 过程 mood 帧   │
│  - StageProgress │                                                         │
│  - ThoughtPanel  │                                                         ▼
│  - ToolPanel     │                                                      LLM stream
│  - ResourcePanel │
│  - MessageActions│
└──────────────────┘
```

### 2.3 改造原则

1. **协议先行**：先定 SSE 帧 schema，三端按 schema 协同推进
2. **增量兼容**：新事件采用「增量」语义，旧前端仍能识别旧字段保持兼容
3. **关注点分离**：前端把 ChatPage 拆成 5 个组件 + 1 个 composable
4. **可观测**：错误帧带 `request_id`（echo-ai 端生成）；echo-core 沿用 `id: <seq>` SSE 字段做事件序号；日志可串联

---

## 3. SSE 协议契约（v2）

### 3.1 帧格式

沿用现有格式：`data: {json}\n\n`，事件名由 `data.type` 决定。

### 3.2 事件枚举（v2）

| type | 触发时机 | 关键字段 | 状态 |
|---|---|---|---|
| `presence` | intent 分类完成后立即下发 | `text` | 保留 |
| `stage` | 5 个阶段每个的开始/结束 | `name, state, ts_ms` | **新增** |
| `context` | 上下文构建完成后 | `intent, intent_source, persona_len, l0_count, l1_count` | 保留 |
| `resource` | L1 召回 + ReAct 工具结果 | `url, file_id, chunk_index, modality, mime_type, similarity, source, iter` | 保留 |
| `tool` | ReAct 工具完成后 | `name, iter, ok, summary` | 保留 |
| `thinking` | LLM 流式 chunk 中 `reasoning_content` 非空 | `stage` 固定 `model_reasoning`, `text` | 保留 |
| `delta` | LLM 增量正文 | `text` | 保留 |
| `done` | 流式结束 | `full` | 保留 |
| `mood_update` | 过程中情绪值变化时 | 7 字段 | **修改**：从「done 后一次」改为「过程中多次」 |
| `emotion_change` | 情绪标签变化时 | `from, to, intensity, reason` | **新增** |
| `relation_change` | 关系值变化时 | `intimacy_delta, trust_delta, satisfaction_delta, source` | **新增** |
| `[DONE]` | OpenAI 兼容哨兵 | — | 保留 |
| `error` | 流式错误（Python 出错 / 解码失败 / 业务异常） | `error, code` | **修改**：保证至少一次 |
| `prefix` | 历史遗留 | — | **删除**（前后端同步移除） |

### 3.3 stage 事件 schema

```json
{
  "type": "stage",
  "name": "intent" | "recall_search" | "tool_dispatch" | "model_reasoning" | "answer",
  "state": "start" | "end",
  "ts_ms": 1737038400123
}
```

阶段顺序约定：`intent → recall_search → tool_dispatch → model_reasoning → answer`，按业务实际可能跳过某些阶段（如不需要工具调用时跳过 `tool_dispatch`）。

### 3.4 心跳帧

echo-core 每 15 秒发送一次注释帧：

```
: ping 1737038415123

```

注释帧不计入 `eventCounts`，但 flush 一次保证 nginx/proxy 不缓冲。

### 3.5 错误事件保证

echo-ai 在以下情况**必须** yield `error` 帧而非静默吞掉：

- LLM 流式异常（`small_stream` 内部 try/except）
- ReAct 决策异常且无可用降级
- 工具执行异常

约定：`error` 帧之后**仍**要 yield `done` 帧（`full=""`），让前端能正确进入完成态。

---

## 4. echo-ai 改造

### 4.1 文件: `biz/chat.py` — `chat_stream()`

每个业务边界加 stage 事件：

```python
# 1. intent 阶段
yield {"type": "stage", "name": "intent", "state": "start", "ts_ms": _now_ms()}
intent = await _classify_intent(...)
yield {"type": "stage", "name": "intent", "state": "end", "ts_ms": _now_ms()}

# 2. recall_search 阶段（仅在 Intent.RECALL 或需要 L1 时进入）
if need_l1:
    yield {"type": "stage", "name": "recall_search", "state": "start", "ts_ms": _now_ms()}
    hits = await _recall_l1(...)
    for hit in hits:
        yield _hit_to_resource(hit)
    yield {"type": "stage", "name": "recall_search", "state": "end", "ts_ms": _now_ms()}

# 3. tool_dispatch 阶段（ReAct 循环每次工具调用前后）
for iter in react_iters:
    yield {"type": "stage", "name": "tool_dispatch", "state": "start", "ts_ms": _now_ms()}
    result = await dispatch_tool(...)
    yield {"type": "tool", ...}
    yield {"type": "stage", "name": "tool_dispatch", "state": "end", "ts_ms": _now_ms()}

# 4. model_reasoning 阶段（小模型流开始/结束）
yield {"type": "stage", "name": "model_reasoning", "state": "start", "ts_ms": _now_ms()}
async for content, reasoning in reply_client.small_stream(...):
    if reasoning:
        yield {"type": "thinking", ...}
    if content:
        yield {"type": "delta", ...}
yield {"type": "stage", "name": "model_reasoning", "state": "end", "ts_ms": _now_ms()}

# 5. answer 阶段（**实现期确认**：建议从首条 delta 到 done 前一帧）
yield {"type": "stage", "name": "answer", "state": "start", "ts_ms": _now_ms()}  # 在 yield 第一条 delta 之前调用
# （delta 流式 yield 期间无额外 stage 事件，因为 model_reasoning 阶段已 start）
yield {"type": "stage", "name": "answer", "state": "end", "ts_ms": _now_ms()}    # 在 yield done 之前调用
yield {"type": "done", ...}
```

> **决策点（待确认）**：`answer.start` 是在第一条 `delta` 之前 yield，还是在 `model_reasoning.end` 之后立即 yield？建议前者（与用户可感知的「开始输出正文」对齐）。

### 4.2 文件: `llm/client.py` — `small_stream()`

不再静默吞异常。重构为：内部 `try/except` → `yield` 一个错误标记 → 让上层 `chat_stream` 决定怎么结束。

```python
async def small_stream(self, messages, *, ...):
    try:
        stream = await self._small_client.chat.completions.create(...)
        async for chunk in stream:
            ...
            yield content, reasoning, None  # (content, reasoning, error)
    except Exception as e:
        log_exception(...)
        yield "", "", str(e)  # 错误标记
```

`biz/chat.py` 在调用层捕获错误标记 → yield `error` 帧 → yield `done` 帧 → `return`。

### 4.3 文件: `character/mood.py` — 过程性情绪下发

- 把 `compute_instant` 调用从「`done` 后一次」改为「每 N 个 delta chunk 一次」（N 可配置，默认 20）
- 阈值从 `0.15` 降为 `0.05`（更敏感）
- 每次变化 yield `mood_update` + 若 emotion 标签变了 yield `emotion_change`
- 关系值变化（intimacy/trust/satisfaction 任一变化 > 0.02）→ yield `relation_change`

### 4.4 文件: `app/agent_runner.py` — `/chat` 入口

无破坏性改动。`_gen()` 仅做透传。`error` 帧处理透传给前端。

---

## 5. echo-core 改造

### 5.1 文件: `handlers/chat_stream_handler.go` — `streamResponse()`

#### 5.1.1 心跳实现

```go
heartbeatTicker := time.NewTicker(15 * time.Second)
defer heartbeatTicker.Stop()

for {
    select {
    case <-ctx.Done():
        // 客户端断开 → 清理
        return
    case <-heartbeatTicker.C:
        if _, err := fmt.Fprintf(c.Writer, ": ping %d\n\n", time.Now().UnixMilli()); err != nil {
            return
        }
        flusher.Flush()
    case ev, ok := <-eventCh:
        if !ok {
            return
        }
        // 写正常 SSE 帧
        ...
    }
}
```

#### 5.1.2 进度 ticker 替换

删除现有 `progressTicker := time.NewTicker(2 * time.Second)`（l.125 占位），替换为上面的 `heartbeatTicker`。

#### 5.1.3 客户端断开处理

```go
// 在 defer 里检查 ctx.Err()
defer func() {
    if ctx.Err() != nil {
        utils.LogWithCtx(ctx, "Chat", "客户端断开", ...)
        // 取消 Python HTTP 请求（见 5.2）
    }
}()
```

### 5.2 文件: `remote/python_chat_client.go` — 主动取消

```go
type PythonChatClient struct {
    ...
    cancelFn context.CancelFunc  // 每次 stream 调用保存
}

func (c *PythonChatClient) ChatStreamEvents(ctx context.Context, ...) error {
    streamCtx, cancel := context.WithCancel(ctx)
    c.cancelFn = cancel
    defer func() { c.cancelFn = nil }()
    ...
    req = req.WithContext(streamCtx)
    ...
}
```

`ChatHandler.streamResponse` 收到 `ctx.Done()` 时调用 `client.CancelStream(req.UserID, req.SessionID)`。

### 5.3 文件: `dto/chat_dto.go` — `ChatEvent` 新增字段

```go
type ChatEvent struct {
    Type      string          `json:"type"`
    // ... 现有字段

    // v2 新增
    Stage     *StageEvent     `json:",omitempty"`     // stage 事件
    Mood      *MoodUpdate     `json:",omitempty"`     // mood_update
    Emotion   *EmotionChange  `json:",omitempty"`     // emotion_change
    Relation  *RelationChange `json:",omitempty"`     // relation_change
}

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
    IntimacyDelta    float64 `json:"intimacy_delta"`
    TrustDelta       float64 `json:"trust_delta"`
    SatisfactionDelta float64 `json:"satisfaction_delta"`
    Source           string  `json:"source"`
}
```

### 5.4 文件: `remote/python_chat_client.go` — 日志采样更新

`logStreamEvent` switch 增加 `stage / mood_update / emotion_change / relation_change` 分支。

---

## 6. echo-web 改造

### 6.1 组件拆分（ChatPage.vue → 多文件）

```
src/
├── views/chat/ChatPage.vue          # 容器（< 500 行）
├── components/chat/
│   ├── StageProgress.vue            # 5 阶段进度条
│   ├── StreamingBubble.vue          # 流式气泡壳
│   ├── ThoughtPanel.vue             # 思考折叠面板
│   ├── ToolCallsPanel.vue           # 工具调用折叠面板
│   ├── ResourcesPanel.vue           # 资源附件折叠面板
│   ├── MessageActions.vue           # 操作行（复制/朗读/反馈）
│   └── ChatMarkdown.vue             # Markdown 渲染器（封装 renderMarkdown + 节流）
├── composables/
│   ├── useChatStream.ts             # SSE 订阅 + 状态机 + 打字机
│   └── useTypewriter.ts             # 打字机（已存在，扩展多实例/cleanup）
└── stores/chat.ts                  # Pinia store（扩展 stageState / streamingMessage）
```

### 6.2 useChatStream composable

封装 SSE 订阅、阶段状态机、AbortController、打字机调度：

```ts
export function useChatStream() {
  const stageState = ref<Record<StageName, 'idle'|'running'|'done'|'skipped'>>({...})
  const currentStage = ref<StageName | null>(null)
  const streamingMessage = ref<StreamingMessage | null>(null)
  const abortController = ref<AbortController | null>(null)
  
  async function start(payload: ChatRequest) { ... }
  function cancel() { abortController.value?.abort() }
  
  // 阶段事件回调
  function onStageStart(name: StageName) {
    stageState.value[name] = 'running'
    currentStage.value = name
  }
  function onStageEnd(name: StageName) {
    stageState.value[name] = 'done'
  }
  
  return { stageState, currentStage, streamingMessage, start, cancel, ... }
}
```

### 6.3 Pinia store 扩展（`stores/chat.ts`）

新增：

```ts
interface ChatStoreState {
  // ... 现有字段
  
  // 流式阶段状态机
  stageState: Record<StageName, 'idle'|'running'|'done'|'skipped'>
  currentStage: StageName | null
  
  // 实时情绪/关系（用于驱动 PixelCharacter）
  liveMood: ChatMoodUpdate | null
  liveRelation: { intimacy: number; trust: number; satisfaction: number } | null
}
```

`appendMessageXxx` 系列方法保持兼容，新增 `setStageState / setCurrentStage / setLiveMood`。

### 6.4 StageProgress.vue

5 阶段胶囊式进度条，接收 `stageState` prop：

```vue
<template>
  <div class="stage-progress">
    <div
      v-for="stage in STAGES"
      :key="stage.name"
      :class="['stage-chip', `stage-${stageState[stage.name]}`]"
    >
      <span class="stage-icon">{{ stageIcon(stage.name, stageState[stage.name]) }}</span>
      <span class="stage-label">{{ stage.label }}</span>
    </div>
  </div>
</template>
```

样式（B 风格）：

```css
.stage-progress { display: flex; gap: 4px; }
.stage-chip {
  flex: 1;
  font-size: 11px;
  padding: 7px 4px;
  border-radius: 999px;
  text-align: center;
  transition: background-color 0.3s, color 0.3s, box-shadow 0.3s;
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
```

### 6.5 StreamingBubble.vue

主答案 + 三折叠子面板的容器：

```vue
<template>
  <div class="bubble">
    <StageProgress v-if="isStreaming || hasAnyPanel" :stage-state="msg.stageState" />
    
    <div class="main-content" v-html="renderedMarkdown" />
    
    <ThoughtPanel
      v-if="msg.thinkings?.length"
      :thinkings="msg.thinkings"
      :default-open="isStreaming"  <!-- 流式中默认展开 -->
      :streaming-text="streamingReasoning"
    />
    
    <ToolCallsPanel
      v-if="msg.toolCalls?.length"
      :tool-calls="msg.toolCalls"
      :default-open="isStreaming"
    />
    
    <ResourcesPanel
      v-if="msg.resources?.length"
      :resources="msg.resources"
      :default-open="isStreaming"
    />
    
    <MessageActions v-if="!isStreaming" :message="msg" />
  </div>
</template>
```

### 6.6 性能优化

- **Markdown 渲染节流**：用 `requestAnimationFrame` 合并多次 tick 的渲染
- **打字机清理**：`onUnmounted` / `onDone` 时 `stop(true)` 并 null 化实例
- **`session.updatedAt` 不再每次 tick 写入**：用 `streamingTickRef` 单独驱动
- **ChatMarkdown 组件隔离**：`v-html` 范围限定在子组件，避免外层 re-render

### 6.7 错误处理

```ts
function onError(error: ChatError) {
  // 1. 走 toast 提示
  toast.error(`对话出错：${error.message}`)
  // 2. 标记当前消息为失败态
  if (streamingMessage.value) {
    markMessageFailed(streamingMessage.value.id, error)
  }
  // 3. 兜底 done（确保前端从流式态退出）
  forceFlushTypewriters()
  // 4. 清理 AbortController
  abortController.value = null
}
```

---

## 7. 兼容性 & 回滚

### 7.1 协议兼容

- 新增事件类型（`stage / emotion_change / relation_change`）：旧前端忽略，不影响功能
- 修改事件（`mood_update`）：旧前端继续识别字段名，只是会少收到一些帧
- 删除事件（`prefix`）：旧前端如果还在监听 `parsePrefix`，会 no-op，可平滑过渡

### 7.2 灰度上线

1. 先合并 echo-ai 协议变更（`stage / 错误保证 / 过程性 mood`）→ 后端兼容
2. 再合并 echo-core 心跳 + 主动取消
3. 最后合并 echo-web 重构（前端可独立测试）

### 7.3 回滚策略

每个仓库独立 feature 分支，回滚只需 revert 单仓 PR：
- echo-web: revert feature/streaming-ux
- echo-core: revert feature/sse-heartbeat
- echo-ai: revert feature/stage-events

---

## 8. 测试策略

### 8.1 协议层

- echo-ai: 单元测试验证 `chat_stream` 在每条路径下产出的事件序列（如「无工具调用」「多工具迭代」「LLM 异常」三种路径）
- echo-core: 集成测试模拟 SSE 客户端验证心跳帧 15s 间隔

### 8.2 前端

- 组件测试：StageProgress 在不同 stageState 下的渲染快照
- composable 测试：useChatStream 在 mock SSE 下的状态机转移
- e2e：playwright 跑一遍发问 → 看阶段条 + 折叠面板 → 复制/朗读按钮

### 8.3 端到端

手工验证场景：
1. 普通对话（不触发工具）→ 应跳过 tool_dispatch 阶段
2. 需要回忆的对话 → 应走完 5 个阶段
3. AI 异常 → 应看到 error toast + 消息标记为失败（而非永远挂起）
4. 客户端关闭 → echo-core 日志应记录「客户端断开」并取消 Python 请求

---

## 9. 开放问题

### 9.1 待用户确认

1. **`answer` 阶段边界**：从首条 delta 开始，还是从 `model_reasoning.end` 开始？**建议后者**（与现有 `done` 帧对应）。
2. **`tool_dispatch` 阶段粒度**：每个 ReAct 迭代 start/end 一次（多次），还是整个 ReAct 循环 start/end 一次（单次）？**建议多次**（过程感更强）。
3. **`mood_update` 频率**：每 20 个 delta chunk 一次 + 阈值 0.05 是否合适？**需要调参**。
4. **是否需要在主答案加「重新生成」按钮**？当前 TTS/复制已有，「重新生成」是新动作。

### 9.2 实现期再决定

- 高亮代码块的 syntax 选择（highlight.js vs prismjs）
- 阶段进度条在 done 后是否完全隐藏（推荐是，但可配置）

---

## 10. 变更清单（按文件）

### 10.1 echo-ai
- `biz/chat.py` — 加 stage 事件 + 错误 yield + 过程性 mood
- `llm/client.py` — `small_stream` 异常不再吞
- `character/mood.py` — 多次采样 + 阈值调整
- `app/agent_runner.py` — 仅日志更新

### 10.2 echo-core
- `handlers/chat_stream_handler.go` — 心跳实现 + ctx 取消
- `remote/python_chat_client.go` — 主动取消 + 日志更新
- `dto/chat_dto.go` — 新增 StageEvent/EmotionChange/RelationChange 类型
- `service/role_core_service.go` — 无改动

### 10.3 echo-web
- `views/chat/ChatPage.vue` — 重构为容器
- `components/chat/*.vue` — 新增 7 个组件
- `composables/useChatStream.ts` — 新增 composable
- `composables/useTypewriter.ts` — 扩展多实例/cleanup
- `stores/chat.ts` — 扩展 stageState/liveMood/liveRelation
- `api/chat.ts` — 新增 parseStageEvent/parseEmotionChange/parseRelationChange；删除 parsePrefix

---

## 11. 时间估算（粗略）

| 仓 | 工作量 |
|---|---|
| echo-ai | 1-2 天 |
| echo-core | 0.5-1 天 |
| echo-web | 3-5 天（含组件拆分、状态机、UI 调优、e2e） |
| 三端联调 | 1-2 天 |
| **合计** | **约 1-2 周** |

---

**审阅清单（用户确认后开始 implementation plan）**：
- [ ] §3.2 事件枚举是否完整
- [ ] §4.1 stage 触发逻辑是否符合预期
- [ ] §6.1 组件拆分粒度是否合理
- [ ] §9.1 四个开放问题的答案
- [ ] §7 灰度上线顺序是否符合发布计划