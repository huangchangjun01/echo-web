<template>
  <div class="echo-layout">
    <!-- Sidebar: sessions list -->
    <aside class="echo-sidebar" :class="{ 'is-collapsed': sidebarCollapsed }">
      <div class="sidebar-header">
        <button class="new-chat-btn" @click="handleNewChat">
          <el-icon><Plus /></el-icon>
          <span v-if="!sidebarCollapsed">新对话</span>
        </button>
        <!-- 模式切换：文本对话 / 像素人物 -->
        <div v-if="!sidebarCollapsed" class="mode-switcher" role="tablist" aria-label="对话模式">
          <button
            class="mode-switcher__btn"
            :class="{ 'mode-switcher__btn--active': chatMode === 'text' }"
            role="tab"
            :aria-selected="chatMode === 'text'"
            @click="handleSwitchMode('text')"
            title="文本对话"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span>对话</span>
          </button>
          <button
            class="mode-switcher__btn"
            :class="{ 'mode-switcher__btn--active': chatMode === 'pixel' }"
            role="tab"
            :aria-selected="chatMode === 'pixel'"
            @click="handleSwitchMode('pixel')"
            title="像素人物"
          >
            <el-icon><UserFilled /></el-icon>
            <span>像素</span>
          </button>
        </div>
      </div>

      <div class="sessions-list" v-show="!sidebarCollapsed">
        <div
          v-for="session in chatStore.sessions"
          :key="session.id"
          class="session-item"
          :class="{ 'session-item--active': chatStore.currentSessionId === session.id }"
          @click="chatStore.currentSessionId = session.id"
        >
          <el-icon class="session-icon"><ChatDotRound /></el-icon>
          <span class="session-title">{{ session.title }}</span>
          <button
            class="session-delete"
            @click.stop="chatStore.deleteSession(session.id)"
            title="删除"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <div v-if="chatStore.sessions.length === 0" class="sessions-empty">
          <p>暂无对话记录</p>
        </div>
      </div>
    </aside>

    <!-- Toggle sidebar button -->
    <button class="sidebar-toggle" @click="toggleSidebar" :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'">
      <el-icon v-if="sidebarCollapsed"><DArrowRight /></el-icon>
      <el-icon v-else><DArrowLeft /></el-icon>
    </button>

    <!-- Main chat area -->
    <div class="chat-main">
      <!-- ==================== 文本对话模式 ==================== -->
      <div v-if="chatMode === 'text'" class="chat-mode chat-mode--text">
      <!-- Empty state -->
      <div v-if="!chatStore.currentSession" class="chat-empty">
        <div class="empty-content">
          <h2 class="empty-title">ECHO</h2>
          <p class="empty-subtitle">即刻为你解答</p>
          <div class="empty-input-wrapper" :class="{ 'empty-input-wrapper--recording': isListening }">
            <el-input
              v-model="emptyInputText"
              type="textarea"
              :rows="1"
              :autosize="{ minRows: 1, maxRows: 4 }"
              :placeholder="emptyInputPlaceholder"
              class="empty-input"
              @keydown.enter.exact.prevent="handleEmptySend"
              :disabled="isListening"
            />
            <div class="empty-input-actions">
              <button
                class="empty-autoplay-btn"
                :class="{ 'empty-autoplay-btn--on': autoPlay }"
                @click="handleToggleAutoPlay"
                :title="autoPlay ? '自动播报已开启，点击关闭' : '自动播报已关闭，点击开启'"
              >
                <el-icon><Headset v-if="autoPlay" /><Mute v-else /></el-icon>
                <span>自动播报</span>
              </button>
              <button
                v-if="!speech.isSupported"
                class="empty-mic-btn empty-mic-btn--disabled"
                disabled
                title="当前浏览器不支持语音识别"
              >
                <el-icon><Microphone /></el-icon>
              </button>
              <button
                v-else-if="isListening"
                class="empty-mic-btn empty-mic-btn--recording"
                @click="handleToggleMic"
                title="停止录音"
              >
                <el-icon><VideoPause /></el-icon>
              </button>
              <button
                v-else
                class="empty-mic-btn"
                @click="handleToggleMic"
                title="开始语音输入"
              >
                <el-icon><Microphone /></el-icon>
              </button>
              <button
                class="empty-send-btn"
                :disabled="!emptyInputText.trim()"
                @click="handleEmptySend"
              >
                <el-icon><Promotion /></el-icon>
              </button>
            </div>
          </div>
          <div v-if="isListening" class="recording-hint recording-hint--empty">
            <span class="recording-dot" />
            <span class="recording-label">正在聆听…</span>
            <span v-if="displayInterim" class="recording-interim">{{ displayInterim }}</span>
            <span v-else class="recording-interim recording-interim--placeholder">请开始讲话</span>
            <button
              class="recording-abort-btn"
              type="button"
              @click="handleAbort"
              title="终止本次语音"
            >
              <el-icon><CircleClose /></el-icon>
              <span>终止</span>
            </button>
          </div>
          <div class="quick-starts">
            <button
              v-for="q in quickStarts"
              :key="q"
              class="quick-start-btn"
              @click="handleQuickStart(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Messages area -->
        <div class="messages-area" ref="messagesArea">
          <div class="messages-inner">
            <div
              v-for="msg in chatStore.currentSession.messages"
              :key="msg.id"
              class="message-wrapper"
              :class="`message-wrapper--${msg.role}`"
            >
              <div class="message-avatar">
                <template v-if="msg.role === 'user'">
                  <el-icon><UserFilled /></el-icon>
                </template>
                <template v-else>
                  <span class="ai-avatar">
                    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                      <defs>
                        <linearGradient id="aiAvatarBg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stop-color="#5b8def"/>
                          <stop offset="100%" stop-color="#7c5cff"/>
                        </linearGradient>
                        <linearGradient id="aiAvatarFace" x1="16" y1="10" x2="16" y2="22" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stop-color="#ffffff"/>
                          <stop offset="100%" stop-color="#dbe6ff"/>
                        </linearGradient>
                      </defs>
                      <!-- 外圆：渐变背景 -->
                      <circle cx="16" cy="16" r="14" fill="url(#aiAvatarBg)"/>
                      <!-- 高光：左上弧，让圆球有立体感 -->
                      <circle cx="11" cy="11" r="4" fill="rgba(255,255,255,0.18)"/>
                      <!-- AI 头部（圆角方形） -->
                      <rect x="9" y="10" width="14" height="12" rx="3.5" fill="url(#aiAvatarFace)"/>
                      <!-- 眼睛：两个小圆 -->
                      <circle cx="13.2" cy="16" r="1.05" fill="#2a3a66"/>
                      <circle cx="18.8" cy="16" r="1.05" fill="#2a3a66"/>
                      <!-- 嘴角：微笑弧线 -->
                      <path d="M13.4 19.2 Q16 21 18.6 19.2" stroke="#2a3a66" stroke-width="1.1" stroke-linecap="round" fill="none"/>
                      <!-- 天线：左 -->
                      <line x1="12" y1="10" x2="11.2" y2="6.8" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>
                      <circle cx="11.2" cy="6.2" r="1.2" fill="#ffd66e"/>
                      <!-- 天线：右 -->
                      <line x1="20" y1="10" x2="20.8" y2="6.8" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>
                      <circle cx="20.8" cy="6.2" r="1.2" fill="#ffd66e"/>
                    </svg>
                  </span>
                </template>
              </div>
              <div class="message-bubble" :class="`message-bubble--${msg.role}`">
                <div v-if="editingMessageId === msg.id" class="edit-wrapper">
                  <el-input
                    v-model="editingText"
                    type="textarea"
                    :rows="2"
                    placeholder="修改内容"
                    class="edit-input"
                    @keydown.enter.exact.prevent="handleSaveEdit(msg.id)"
                    @keydown.esc="handleCancelEdit"
                  />
                  <div class="edit-actions">
                    <button class="edit-btn edit-btn--cancel" @click="handleCancelEdit">取消</button>
                    <button class="edit-btn edit-btn--save" @click="handleSaveEdit(msg.id)">发送</button>
                  </div>
                </div>
                <template v-else>
                  <!-- 语音消息：播报按钮 + 识别文本框 -->
                  <div v-if="msg.source === 'voice'" class="voice-block">
                    <div class="voice-block__header">
                      <el-icon class="voice-block__icon"><Microphone /></el-icon>
                      <span class="voice-block__label">语音消息</span>
                    </div>
                    <button
                      class="voice-play-btn"
                      :class="{ 'voice-play-btn--playing': speakingId === msg.id }"
                      @click="handleTogglePlay(msg)"
                      :title="speakingId === msg.id ? '停止播报' : '语音播报'"
                    >
                      <el-icon>
                        <VideoPause v-if="speakingId === msg.id" />
                        <VideoPlay v-else />
                      </el-icon>
                      <span>{{ speakingId === msg.id ? '停止播报' : '语音播报' }}</span>
                    </button>
                    <div class="voice-text-box" :title="msg.content">
                      {{ msg.content || '(未识别到内容)' }}
                    </div>
                  </div>
                  <!-- 普通文本消息 -->
                  <div v-else class="message-content">
                    <!--
                      方案A：装饰性即时回应（presence）。
                      首字到达前在气泡内展示一句"心跳"回应，正文开始后即消失，不进 final_text。
                    -->
                    <span
                      v-if="msg.id === streamingMessageId && !msg.content && presenceText"
                      class="message-presence"
                    >{{ presenceText }}</span>
                    <span v-if="msg.content" v-html="renderMarkdown(msg.content)" />
                    <!--
                      打字机光标：仅在当前正在流式输出的那条消息上显示。
                      streamingMessageId 由 handleSend 启动 typewriter 时设定，
                      done / error / stop 时清空，所以光标自然收起。
                    -->
                    <span
                      v-if="msg.id === streamingMessageId"
                      class="typing-caret"
                      aria-hidden="true"
                    >▍</span>
                  </div>
                  <ChatImage
                    v-if="msg.role === 'assistant' && msg.imageUrl"
                    :src="msg.imageUrl"
                    :alt="msg.content?.slice(0, 30)"
                    class="message-image"
                  />
                  <!-- 附件列表：图片走预览，文件走下载卡片（多资源/混合） -->
                  <ChatAttachment
                    v-if="msg.role === 'assistant' && msg.attachments && msg.attachments.length"
                    :attachments="msg.attachments"
                    class="message-attachments"
                  />
                  <!-- RAG / 检索上下文摘要（event=context）：默认折叠 -->
                  <ChatContext
                    v-if="msg.role === 'assistant' && msg.context"
                    :info="msg.context"
                    class="message-context"
                  />
                  <!-- 思考过程 + 回忆命中详情（event=thinking / event=memory_recall）：
                       流式中默认展开，结束后折叠；DeepSeek 风格展示。
                       reasoning 文本通过 streamingReasoningText 实时打字，仅在当前
                       流式消息生效（其他历史消息自然走 store 累积的 thinkings）。 -->
                  <ChatProcess
                    v-if="msg.role === 'assistant' && ((msg.thinkings && msg.thinkings.length) || msg.memoryRecall)"
                    :thinkings="msg.thinkings"
                    :recall="msg.memoryRecall"
                    :is-streaming="msg.id === streamingMessageId"
                    :streaming-reasoning="msg.id === streamingMessageId ? streamingReasoningText : ''"
                    class="message-process"
                  />
                  <!-- 工具调用（event=tool 累积）：逐条可折叠 -->
                  <ChatToolCall
                    v-if="msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length"
                    :tool-calls="msg.toolCalls"
                    class="message-tool-calls"
                  />
                </template>
              </div>
              <div class="message-actions" v-if="msg.role === 'user' && !editingMessageId">
                <button class="action-btn" @click="handleCopy(msg.content)" title="复制">
                  <el-icon><CopyDocument /></el-icon>
                </button>
                <button class="action-btn" @click="handleEdit(msg)" title="编辑">
                  <el-icon><Edit /></el-icon>
                </button>
                <button class="action-btn action-btn--retry" @click="handleRetry(msg)" title="重试">
                  <el-icon><RefreshRight /></el-icon>
                </button>
              </div>
            </div>

            <!--
              Streaming indicator：只在 SSE 还没下发第一条 delta 之前的"等待/思考"阶段显示三圆点。
              一旦 typewriter 启动、首字符进消息气泡后，让位给气泡内的打字机光标 + 渐增的文本，
              避免出现"消息已满 + 下方还在闪点"的双指示诡异画面。
            -->
            <div
              v-if="chatStore.isStreaming && !streamingMessageId"
              class="message-wrapper message-wrapper--assistant"
            >
              <div class="message-avatar">
                <span class="ai-avatar">
                  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="aiAvatarBg2" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#5b8def"/>
                        <stop offset="100%" stop-color="#7c5cff"/>
                      </linearGradient>
                      <linearGradient id="aiAvatarFace2" x1="16" y1="10" x2="16" y2="22" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#ffffff"/>
                        <stop offset="100%" stop-color="#dbe6ff"/>
                      </linearGradient>
                    </defs>
                    <circle cx="16" cy="16" r="14" fill="url(#aiAvatarBg2)"/>
                    <circle cx="11" cy="11" r="4" fill="rgba(255,255,255,0.18)"/>
                    <rect x="9" y="10" width="14" height="12" rx="3.5" fill="url(#aiAvatarFace2)"/>
                    <circle cx="13.2" cy="16" r="1.05" fill="#2a3a66"/>
                    <circle cx="18.8" cy="16" r="1.05" fill="#2a3a66"/>
                    <path d="M13.4 19.2 Q16 21 18.6 19.2" stroke="#2a3a66" stroke-width="1.1" stroke-linecap="round" fill="none"/>
                    <line x1="12" y1="10" x2="11.2" y2="6.8" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>
                    <circle cx="11.2" cy="6.2" r="1.2" fill="#ffd66e"/>
                    <line x1="20" y1="10" x2="20.8" y2="6.8" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>
                    <circle cx="20.8" cy="6.2" r="1.2" fill="#ffd66e"/>
                  </svg>
                </span>
              </div>
              <div class="message-bubble message-bubble--assistant">
                <span class="streaming-dot" /><span class="streaming-dot" /><span
                  class="streaming-dot"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Input area -->
        <div class="input-area">
          <div class="input-wrapper" :class="{ 'input-wrapper--recording': isListening }">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="1"
              :autosize="{ minRows: 1, maxRows: 8 }"
              :placeholder="inputPlaceholder"
              class="chat-input"
              @keydown.enter.exact.prevent="handleSend"
              :disabled="chatStore.isStreaming || isListening"
            />
            <div class="input-actions">
              <!-- 自动播报开关 -->
              <button
                class="autoplay-btn"
                :class="{ 'autoplay-btn--on': autoPlay }"
                @click="handleToggleAutoPlay"
                :title="autoPlay ? '自动播报已开启，点击关闭' : '自动播报已关闭，点击开启'"
              >
                <el-icon><Headset v-if="autoPlay" /><Mute v-else /></el-icon>
                <span>自动播报</span>
              </button>
              <!-- 语音输入按钮（不支持的浏览器渲染为禁用态） -->
              <button
                v-if="!speech.isSupported"
                class="mic-btn mic-btn--disabled"
                disabled
                title="当前浏览器不支持语音识别"
              >
                <el-icon><Microphone /></el-icon>
              </button>
              <button
                v-else-if="isListening"
                class="mic-btn mic-btn--recording"
                @click="handleToggleMic"
                title="停止录音"
              >
                <el-icon><VideoPause /></el-icon>
              </button>
              <button
                v-else
                class="mic-btn"
                :disabled="chatStore.isStreaming"
                @click="handleToggleMic"
                title="开始语音输入"
              >
                <el-icon><Microphone /></el-icon>
              </button>
              <button
                v-if="chatStore.isStreaming"
                class="stop-btn"
                @click="handleStop"
                title="停止生成"
              >
                <el-icon><VideoPause /></el-icon>
              </button>
              <button
                v-else
                class="send-btn"
                :disabled="!inputText.trim()"
                @click="handleSend"
                title="发送"
              >
                <el-icon><Promotion /></el-icon>
              </button>
            </div>
          </div>
          <!-- 录音实时状态：显示在输入框正下方 -->
          <div v-if="isListening" class="recording-hint">
            <span class="recording-dot" />
            <span class="recording-label">正在聆听…</span>
            <span v-if="displayInterim" class="recording-interim">{{ displayInterim }}</span>
            <span v-else class="recording-interim recording-interim--placeholder">请开始讲话</span>
            <button
              class="recording-abort-btn"
              type="button"
              @click="handleAbort"
              title="终止本次语音"
            >
              <el-icon><CircleClose /></el-icon>
              <span>终止</span>
            </button>
          </div>
        </div>
      </template>
      </div>

      <!-- ==================== 像素人物模式 ==================== -->
      <div v-else class="chat-mode chat-mode--pixel">
        <!-- 背景场景层：占满整个对话页 -->
        <PixelScene class="pixel-mode__scene" />

        <!-- 顶部浮动信息条 -->
        <div class="pixel-topbar">
          <div class="pixel-state-chip">
            <span class="pixel-state-chip__dot" :class="`pixel-state-chip__dot--${pixelState}`" />
            <span class="pixel-state-chip__label">
              {{ pixelStateLabel }} · {{ EMOTION_LABELS[lastEmotion] }}
            </span>
          </div>
          <div class="pixel-topbar__actions">
            <button
              class="pixel-mini-btn"
              :class="{ 'pixel-mini-btn--on': historyOpen }"
              @click="toggleHistory"
              :title="historyOpen ? '关闭历史对话' : '查看历史对话'"
            >
              <el-icon><Document /></el-icon>
              <span>历史</span>
            </button>
            <button
              class="pixel-mini-btn"
              :class="{ 'pixel-mini-btn--on': autoPlay }"
              @click="handleToggleAutoPlay"
              :title="autoPlay ? '已开启自动播报' : '已关闭自动播报'"
            >
              <el-icon><Headset v-if="autoPlay" /><Mute v-else /></el-icon>
              <span>播报</span>
            </button>
            <button
              v-if="tts.isSpeaking.value"
              class="pixel-mini-btn pixel-mini-btn--danger"
              @click="handlePixelStopSpeak"
              title="停止播报"
            >
              <el-icon><VideoPause /></el-icon>
              <span>停</span>
            </button>
            <button
              class="pixel-mini-btn"
              :class="{ 'pixel-mini-btn--on': pixelAutoListen, 'pixel-mini-btn--danger': isListening }"
              @click="pixelAutoListen ? stopPixelAutoListen() : startPixelAutoListen()"
              :title="pixelAutoListen ? '关闭自动语音对话' : '开启自动语音对话'"
            >
              <el-icon><Microphone v-if="!isListening" /><VideoPause v-else /></el-icon>
              <span>{{ isListening ? '正在听' : pixelAutoListen ? '语音开' : '语音关' }}</span>
            </button>
          </div>
        </div>

        <!-- 角色居中展示 -->
        <div class="pixel-mode__character-wrap">
          <PixelCharacter
            :state="pixelState"
            :talking="isPixelTalking"
            :size="characterSize"
            :mood-expression="moodExpression"
            :mood-color="moodColor"
            class="pixel-mode__character"
          />
          <div class="pixel-mode__hint">{{ pixelHint }}</div>
          <!-- M2:心情指示器 -->
          <MoodIndicator :mood="currentMood" class="pixel-mode__mood" />
        </div>

        <!-- 对白区：字幕式交替（默认仅显示当前轮次） -->
        <div class="pixel-mode__dialogue">
          <transition name="subtitle-fade" mode="out-in">
            <!-- 1. 用户刚说完 / 正在听写中 -->
            <div
              v-if="activeSubtitle === 'user' && (pixelUserText || isListening)"
              key="user"
              class="subtitle subtitle--user"
            >
              <div class="subtitle__avatar">你</div>
              <div class="subtitle__bubble">
                <div class="subtitle__name">你</div>
                <div class="subtitle__content">
                  <template v-if="pixelUserText">{{ pixelUserText }}</template>
                  <template v-else-if="displayInterim">{{ displayInterim }}</template>
                  <template v-else class="subtitle__placeholder">说点什么吧…</template>
                </div>
              </div>
            </div>
            <!-- 2. Echo 正在思考 / 回复中 / 播报中 -->
            <div
              v-else-if="activeSubtitle === 'echo' && (pixelDialogue || chatStore.isStreaming || tts.isSpeaking.value)"
              key="echo"
              class="subtitle subtitle--echo"
            >
              <div class="subtitle__avatar subtitle__avatar--echo">E</div>
              <div class="subtitle__bubble subtitle__bubble--echo">
                <div class="subtitle__name">Echo</div>
                <div class="subtitle__content">
                  <span v-if="pixelDialogue" v-html="renderMarkdown(pixelDialogue)" />
                  <span v-else-if="chatStore.isStreaming" class="subtitle__thinking">思考中…</span>
                  <span v-else class="subtitle__placeholder">…</span>
                </div>
              </div>
            </div>
            <!-- 3. 兜底：没有内容时 -->
            <div v-else key="placeholder" class="subtitle subtitle--placeholder">
              <div class="subtitle__bubble subtitle__bubble--placeholder">
                <div class="subtitle__name">Echo</div>
                <div class="subtitle__content">{{ placeholderHint }}</div>
              </div>
            </div>
          </transition>
        </div>

        <!-- 录音实时提示条 -->
        <transition name="bubble-fade">
          <div v-if="isListening" class="pixel-recording">
            <span class="recording-dot" />
            <span class="recording-label">正在聆听…</span>
            <span v-if="displayInterim" class="recording-interim">{{ displayInterim }}</span>
            <span v-else class="recording-interim recording-interim--placeholder">说点什么吧</span>
            <button
              class="recording-abort-btn"
              type="button"
              @click="handleAbort"
              title="终止本次语音"
            >
              <el-icon><CircleClose /></el-icon>
              <span>终止</span>
            </button>
          </div>
        </transition>

        <!-- 历史对话抽拉抽屉 -->
        <transition name="drawer-fade">
          <div v-if="historyOpen" class="history-mask" @click="toggleHistory" />
        </transition>
        <transition name="drawer-slide">
          <aside v-if="historyOpen" class="history-drawer" role="dialog" aria-label="历史对话">
            <div class="history-drawer__header">
              <div class="history-drawer__title">
                <el-icon><Document /></el-icon>
                <span>历史对话</span>
              </div>
              <button class="history-drawer__close" @click="toggleHistory" title="关闭">
                <el-icon><Close /></el-icon>
              </button>
            </div>
            <div class="history-drawer__meta">
              <span>共 {{ historyList.length }} 条</span>
              <span v-if="historyList.length">最新：{{ historyList[historyList.length - 1].time }}</span>
            </div>
            <div class="history-drawer__list">
              <div v-if="!historyList.length" class="history-drawer__empty">
                <p>暂无对话记录</p>
                <p class="history-drawer__hint">说一句试试看吧～</p>
              </div>
              <div
                v-for="item in historyList"
                v-else
                :key="item.id"
                class="history-item"
                :class="`history-item--${item.role}`"
              >
                <div class="history-item__head">
                  <span class="history-item__name">{{ item.role === 'user' ? '你' : 'Echo' }}</span>
                  <span class="history-item__time">{{ item.time }}</span>
                  <span v-if="item.source === 'voice'" class="history-item__tag">语音</span>
                </div>
                <div
                  class="history-item__content"
                  v-html="renderMarkdown(item.content)"
                />
              </div>
            </div>
          </aside>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed, onBeforeUnmount } from 'vue'
import {
  Plus,
  Close,
  ChatDotRound,
  UserFilled,
  Promotion,
  VideoPause,
  VideoPlay,
  CopyDocument,
  RefreshRight,
  Edit,
  DArrowLeft,
  DArrowRight,
  Microphone,
  CircleClose,
  Headset,
  Mute,
  Document,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { useRolesStore } from '@/stores/roles'
import type { ChatSession, Message } from '@/types/chat'
import { sendChatMessageStream } from '@/api/chat'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis'
import { createTypewriter } from '@/composables/useTypewriter'
import PixelCharacter from '@/components/PixelCharacter.vue'
import MoodIndicator from '@/components/MoodIndicator.vue'
import PixelScene from '@/components/PixelScene.vue'
import ChatImage from '@/components/ChatImage.vue'
import ChatAttachment from '@/components/ChatAttachment.vue'
import ChatContext from '@/components/ChatContext.vue'
import ChatProcess from '@/components/ChatProcess.vue'
import ChatToolCall from '@/components/ChatToolCall.vue'
import { detectEmotion, EMOTION_LABELS, type Emotion } from '@/utils/emotion'

const chatStore = useChatStore()
const rolesStore = useRolesStore()
const inputText = ref('')
const emptyInputText = ref('')
const messagesArea = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null
const editingMessageId = ref<string | null>(null)
const editingText = ref('')
const sidebarCollapsed = ref(false)
/** 标记下一条待发送消息的来源（语音 / 文本），handleSend 消费后重置为 text */
const pendingSource = ref<'text' | 'voice'>('text')

/* ---- 对话模式：文本 / 像素人物 ---- */
type ChatMode = 'text' | 'pixel'
const CHAT_MODE_KEY = 'chat_mode'
function loadChatMode(): ChatMode {
  try {
    const v = localStorage.getItem(CHAT_MODE_KEY)
    return v === 'pixel' ? 'pixel' : 'text'
  } catch {
    return 'text'
  }
}
const chatMode = ref<ChatMode>(loadChatMode())
/** 像素人物当前动作状态 */
type PixelState = 'idle' | 'listen' | 'talk' | 'happy' | 'sad' | 'excited' | 'greet' | 'thinking'
const pixelState = ref<PixelState>('idle')
/** 最近一次识别到的情绪（用于提示标签） */
const lastEmotion = ref<Emotion>('neutral')
/** 当前是否有未结束的播报（控制像素人物张嘴） */
const isPixelTalking = ref(false)
/** 像素模式下的会话文本（用于气泡显示） */
const pixelDialogue = ref<string>('')
const pixelUserText = ref<string>('')

/** M2:当前心情快照（来自 SSE mood_update） */
const currentMood = computed(() => chatStore.currentMood)
/** M2:PixelCharacter 8 表情映射 */
const moodExpression = computed(() => currentMood.value?.expression ?? '')
/** M2:PixelCharacter 色调（hex 字符串） */
const moodColor = computed(() => {
  if (!currentMood.value) return ''
  const v = currentMood.value.instantVal
  if (v > 0.5) return 'rgba(255, 220, 120, 0.45)'
  if (v > 0) return 'rgba(255, 255, 255, 0.2)'
  if (v >= -0.5) return 'rgba(120, 180, 255, 0.4)'
  return 'rgba(180, 130, 220, 0.5)'
})

/** 是否在流式响应结束后自动播报后端消息；持久化到 localStorage */
const AUTO_PLAY_KEY = 'chat_auto_play'
function loadAutoPlay(): boolean {
  try {
    const v = localStorage.getItem(AUTO_PLAY_KEY)
    if (v === null) return true // 默认开启
    return v === '1'
  } catch {
    return true
  }
}
const autoPlay = ref(loadAutoPlay())

/* ---- 语音播报（TTS）状态先声明，下方 STT handler 也要用 ---- */
/** 正在播报的消息 id；同一时刻只播一条 */
const speakingId = ref<string | null>(null)

/**
 * 流式响应结束后，是否应该把录音重新拉起来。
 * 触发场景：用户开着录音 → 发了句 → 等待响应时我们主动停了录音。
 * 响应结束（流式 done / 主动 stop / TTS 结束）后再恢复。
 */
const shouldResumeListening = ref(false)

/* ---- 打字机（流式响应节流 + 闪烁光标） ---- */
/**
 * 关键问题：SSE 在 reader.read() 里会把多条 `data:` 帧攒成一坨同步回调，
 * 多条 onChunk 在同一微任务里被连续调用，msg.content 一帧内涨到终态
 * → 用户看到的是"瞬间满屏"，不是逐字打字。
 *
 * 修复：在 SSE → msg.content 之间插一个"打字机节流器"，让 delta 按固定
 * 节奏（28ms / 拍，每拍 1 字符）喂到 UI 上，真正呈现"逐字蹦出"的效果。
 * 流式消息有内容期间在气泡内显示一个闪烁光标 `▍`。
 */
const streamingMessageId = ref<string | null>(null)
let typewriter: ReturnType<typeof createTypewriter> | null = null

/** 方案A：装饰性即时回应（presence）。首个 delta 到达前在 assistant 气泡内展示，随后清空。 */
const presenceText = ref('')

function startStreamingTypewriter(messageId: string, sink: (chunk: string) => void) {
  if (typewriter) typewriter.stop(true)
  streamingMessageId.value = messageId
  typewriter = createTypewriter({
    charsPerTick: 1,
    tickMs: 28,
    onAppend: sink,
    onIdle: () => {
      // 队列自然清空（极少触发——done/error 时走 stop flush，不依赖这里）
    },
  })
}

function stopStreamingTypewriter(flush: boolean, sink?: (chunk: string) => void) {
  if (!typewriter) return
  typewriter.stop(flush, sink)
  typewriter = null
  streamingMessageId.value = null
}

/* ---- 思考打字机（model_reasoning 内容逐字呈现） ---- */
/**
 * 模型思考正文（event=thinking stage=model_reasoning）通常一次下发数百字符，
 * 直接渲染会"瞬间满屏"。这里再接一层打字机，让思考内容也按节奏逐字呈现，
 * 视觉上更像 DeepSeek：思考区在「思考中…」状态下持续蹦字。
 *
 * 与正文打字机的区别：
 *   - 速度更快（20ms/tick × 2 字符）≈ 100 字/秒，避免长思考内容等待过久
 *   - 输出目标不是 msg.content，而是独立的 streamingReasoningText ref，
 *     ChatProcess.vue 直接读取这个 ref 渲染"模型思考"区
 *   - stage 事件（intent / context_build / recall_search / react_decision /
 *     cascade）走原始 store.appendMessageThinking，不进打字机——它们是离散
 *     状态标签，应即时显示，不应逐字蹦
 */
const streamingReasoningText = ref('')
let reasoningTypewriter: ReturnType<typeof createTypewriter> | null = null

function startReasoningTypewriter(sink: (chunk: string) => void) {
  if (reasoningTypewriter) reasoningTypewriter.stop(true)
  streamingReasoningText.value = ''
  reasoningTypewriter = createTypewriter({
    charsPerTick: 2,
    tickMs: 20,
    onAppend: sink,
  })
}

function pushReasoning(text: string) {
  if (!reasoningTypewriter) return
  reasoningTypewriter.push(text)
}

function stopReasoningTypewriter(flush: boolean, sink?: (text: string) => void) {
  if (!reasoningTypewriter) return
  reasoningTypewriter.stop(flush, sink)
  reasoningTypewriter = null
}

/* ---- 语音识别（STT，连续模式 + VAD 断句） ---- */
// 关键修复：之前漏挂 onSentence，导致 VAD 断句后识别出的文本无人消费，
// 看上去就是"说完话不断句、不发送"。现在把 handleSentence 接上去。
const speech = useSpeechRecognition({
  lang: 'zh-CN',
  continuous: true,
  interimResults: true,
  silenceTimeoutMs: 1200,
  // VAD 检测到一句话结束（连续模式 + 静默超时）时回调。
  // 在这里把识别文本送进输入框 / 自动发送给后端。
  onSentence: (text) => {
    void handleSentence(text)
  },
  onError: (msg) => {
    // 不支持 / 没有权限 / 麦克风未授权等情况，提示用户
    if (msg === 'not-allowed' || msg === 'service-not-allowed') {
      ElMessage.error('麦克风权限被拒绝，请在浏览器设置中允许后重试')
    } else if (msg === 'no-speech') {
      // 静默超时，常见且无需打扰
      console.info('[chat] no speech detected')
    } else if (msg === 'aborted') {
      console.info('[chat] voice input aborted by user')
      ElMessage.info('已终止本次语音')
    } else {
      ElMessage.warning(`语音识别失败: ${msg}`)
    }
  },
  // 用户主动停止（点麦克风 / 离开页面）后清掉"待恢复"标记
  onEnd: () => {
    shouldResumeListening.value = false
    console.info('[chat] voice session ended')
  },
})
const isListening = speech.isListening

/** 录音时给输入框的占位提示（静态计算一次） */
const inputPlaceholder = computed(() =>
  isListening.value ? '正在聆听… 说完后自动发送' : '输入消息，Shift+Enter 换行',
)

/** 空状态输入框的占位提示（与对话态共用同一个录音状态） */
const emptyInputPlaceholder = computed(() =>
  isListening.value ? '正在聆听… 说完后自动发送' : '输入消息，Shift+Enter 换行',
)

/** 录音中展示的实时文字：已敲定 + 中间结果 */
const displayInterim = computed(() => {
  const finalized = speech.currentSentence.value.trim()
  const interim = speech.interimTranscript.value.trim()
  if (finalized && interim) return `${finalized} ${interim}`
  return finalized || interim
})

/* ---- 语音播报（TTS） ---- */
// 音色调成"甜美少女音"：
//  - pitch 略升 → 听感更年轻软糯
//  - rate 略放缓 → 减少机器感、咬字更清晰
//  - 实际音色由 pickVoice 评分挑选（优先 Microsoft Xiaoxiao 等 Natural 神经合成女声）
const tts = useSpeechSynthesis({
  lang: 'zh-CN',
  pitch: 1.18,
  rate: 0.96,
  onStart: () => {
    // onstart 内能拿到 speakingId（已在 speak() 之前设置好）
    console.info('[chat] tts started, id=%s', speakingId.value ?? '')
  },
  onEnd: () => {
    // 朗读结束（自然结束 / 主动 cancel 都算），清状态并恢复录音
    speakingId.value = null
    resumeListeningIfNeeded()
  },
  onError: (msg) => {
    speakingId.value = null
    resumeListeningIfNeeded()
    console.warn('[chat] tts error: %s', msg)
  },
})

/* ========================================================================
 * 语音插话打断（barge-in）—— 满足"用户说话 → 打断 TTS → 等用户说完 →
 *                          拿到 chat 回复 → 播报新 TTS"的端到端流
 *
 * 完整时序：
 *   1. TTS 开始（autoPlay / 像素自动语音） → startBargeInListening() 拉起 mic
 *   2. 用户开口说话 → displayInterim watcher 命中 → tts.stop() + 打 userIsInterrupting
 *   3. TTS 取消回调触发 onEnd → tts.isSpeaking 翻 false
 *   4. tts.isSpeaking watcher 检测到 bargeInArmed + userIsInterrupting → 保留 mic
 *   5. mic 继续听写 → VAD 命中 → onSentence → handleSentence → handleSend
 *   6. handleSend 内主动 stop mic，避免与 chat 回包混流
 *   7. 后端 SSE 流式回包到 [DONE] → onDone 触发 tts.speak(...)（新 TTS）
 *   8. tts.isSpeaking 翻 true → userIsInterrupting 清零 → 重新拉起 mic 监听下一次插话
 *
 * 关键不变量：
 *   - bargeInArmed=true 期间 mic 永不主动关闭（除非用户/autoPlay 主动撤）
 *   - 新的 TTS 永远在 SSE [DONE] 之后才发出，绝不会和用户句子"撞车"
 *   - 用户主动停麦 / 关闭 autoPlay 时必须清掉 userIsInterrupting，避免脏状态泄漏
 * ====================================================================== */

/** 当前 mic 是否因 barge-in 需求而开启（用于 TTS 结束时判断要不要回收） */
const bargeInArmed = ref(false)
/** 是否检测到用户在 TTS 期间真正开口（区分"自然结束 vs 用户打断"） */
const userIsInterrupting = ref(false)
/** TTS 开始时间戳；用于宽限期判断（让浏览器 AEC 稳定） */
let ttsStartedAt = 0
/** TTS 开始后多少毫秒内忽略 interim，避免回声立刻误打断 */
const BARGE_IN_GRACE_MS = 500
/** 至少识别到多少字符才视为真正插话（过滤回声 / 单字噪声） */
const BARGE_IN_MIN_LEN = 2

/**
 * 自动播报场景下，拉起 mic 监听用户插话。
 * 仅当浏览器支持 STT、当前未在录音、且自动播报相关开关已打开时启动。
 */
function startBargeInListening() {
  if (!speech.isSupported.value) return
  if (isListening.value) return
  const wantBargeIn =
    autoPlay.value || (chatMode.value === 'pixel' && pixelAutoListen.value)
  if (!wantBargeIn) return
  bargeInArmed.value = true
  userIsInterrupting.value = false
  // reset 一下让 grace 期内潜在的回声片段不会污染下一句
  speech.reset()
  speech.start()
  console.info('[chat] barge-in mic armed')
}

/** 兜底清理：把 barge-in 相关状态复原到"未插话"基线 */
function resetBargeInState(reason: string) {
  if (!bargeInArmed.value && !userIsInterrupting.value) return
  bargeInArmed.value = false
  userIsInterrupting.value = false
  console.info('[chat] barge-in state reset (%s)', reason)
}

/** TTS 状态变化：开始时拉起 mic；结束时按"是否被打断"分别清理 */
watch(tts.isSpeaking, (speaking, prev) => {
  if (speaking && !prev) {
    ttsStartedAt = Date.now()
    userIsInterrupting.value = false
    startBargeInListening()
    return
  }
  if (!speaking && prev && bargeInArmed.value) {
    bargeInArmed.value = false
    if (userIsInterrupting.value) {
      // 用户已开口，mic 必须保持开启等 handleSentence 接管；
      // 新 TTS 只有在 handleSend → SSE onDone 之后才会被触发，
      // 那时 handleSend 会自己 stop mic、speak 完后我们再 arm mic。
      console.info('[chat] barge-in active, keep mic for user sentence')
      return
    }
    // TTS 自然结束且无人插话：像素模式 autoListen 时由原有 watcher 保留 mic；
    // 文本模式则主动关麦避免空转
    const keepMic =
      chatMode.value === 'pixel' && pixelAutoListen.value
    if (!keepMic && isListening.value) {
      console.info('[chat] tts ended without barge-in, stop mic')
      speech.stop()
    }
    userIsInterrupting.value = false
  }
})

/**
 * 用户在 TTS 播报期间开口 → 立即打断（grace 期 + 阈值过滤）。
 * 打断后 mic 仍保持开启，直到 handleSentence 把识别结果送给后端、
 * 后端 SSE 回包到 [DONE]，新的 TTS 再被 speak 出来。
 */
watch(
  () => displayInterim.value,
  (text) => {
    if (!tts.isSpeaking.value) return
    if (Date.now() - ttsStartedAt < BARGE_IN_GRACE_MS) return
    const trimmed = text.trim()
    if (trimmed.length < BARGE_IN_MIN_LEN) return
    if (userIsInterrupting.value) return
    userIsInterrupting.value = true
    console.info(
      '[chat] barge-in detected, interim="%s" → stop TTS, wait for user sentence',
      trimmed,
    )
    tts.stop()
    speakingId.value = null
  },
)

/**
 * 用户手动关麦时（handleToggleMic / speech 自然 onend）→ 兜底清掉插话标记，
 * 避免脏状态泄漏到下一轮 TTS 周期。
 */
watch(isListening, (listening, prev) => {
  if (prev && !listening && bargeInArmed.value) {
    // mic 是被外部因素关掉的（用户主动 stop / 浏览器异常），不是 barge-in 流程自己关的
    resetBargeInState('mic stopped externally')
  }
})

/** 持久化 autoPlay 状态：变更时写 localStorage；关闭时立即停播 */
watch(autoPlay, (v) => {
  try {
    localStorage.setItem(AUTO_PLAY_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
  // 用户主动关闭时，立刻停掉正在播放的语音并撤掉 barge-in mic
  if (!v) {
    tts.stop()
    speakingId.value = null
    if (bargeInArmed.value && isListening.value) {
      // barge-in 拉起的 mic 也一并关掉，避免后台空转
      speech.stop()
    }
    resetBargeInState('autoPlay disabled')
  }
})

/** 切换录音状态（点麦克风） */
function handleToggleMic() {
  if (isListening.value) {
    speech.stop()
    return
  }
  speech.reset()
  speech.start()
}

/**
 * 主动终止本次录音：说错了话或不想继续时调用。
 * abort() 会同步清空已收集的 sentence，避免把半句话自动发送出去。
 */
function handleAbort() {
  if (!isListening.value) return
  speech.abort()
  shouldResumeListening.value = false
  console.info('[chat] user aborted current voice input')
}

/**
 * 语音识别检测到"断句"时的统一入口。
 * - 空状态：把识别文本灌进 emptyInputText，自动建会话 + 发送
 * - 对话态：直接灌进 inputText，标记为 voice 后自动发送
 * 整个流程对用户透明：无需再点发送。
 */
async function handleSentence(text: string) {
  if (!text) return
  if (chatStore.isStreaming) {
    // 极端情况：响应还没结束，识别器却提交了句子（理论上我们已停掉了识别器，
    // 但保险起见）。丢弃并提示。
    console.warn('[chat] sentence committed during streaming, dropped:', text)
    return
  }
  if (!chatStore.currentSession) {
    emptyInputText.value = text
    await handleEmptySend()
    return
  }
  inputText.value = text
  pendingSource.value = 'voice'
  await handleSend()
}

/** 切换自动播报开关 */
function handleToggleAutoPlay() {
  autoPlay.value = !autoPlay.value
}

/** 切换语音播报（点消息上的按钮手动播 / 停） */
function handleTogglePlay(msg: Message) {
  if (speakingId.value === msg.id) {
    tts.stop()
    speakingId.value = null
    // 手动停播不影响"是否恢复录音"——这里不需要 resume
    return
  }
  // 切换到新消息前先停掉上一条
  tts.stop()
  speakingId.value = msg.id
  tts.speak(msg.content)
}

/**
 * 在合适的时机重新拉起录音识别。
 * - 仅当用户原本就开着录音（shouldResumeListening=true）才恢复
 * - 当前不在听写中才启动（防止多次 stop/start 竞态）
 * - 若还在流式响应中则推迟到 done 回调
 * - 若 mic 已被 barge-in 拉起在听，直接放过，避免 reset() 抹掉用户当前的句子
 */
function resumeListeningIfNeeded() {
  if (!shouldResumeListening.value) return
  if (chatStore.isStreaming) return
  if (!speech.isSupported.value) {
    shouldResumeListening.value = false
    return
  }
  shouldResumeListening.value = false
  // 关键：若 barge-in 期间 mic 已在监听用户插话，绝不能 reset，否则会把刚刚识别到的半句话清空
  if (isListening.value) return
  // 用 nextTick 把"恢复动作"放到所有状态更新之后，避免和 TTS 抢资源
  nextTick(() => {
    speech.reset()
    speech.start()
  })
}

onMounted(() => {
  chatStore.initDefaultSession().then(() => {
    // 匿名场景下，确保 chatStore.sessionId 有值（登录态由 watch 自动同步）
    chatStore.ensureAnonymousSession()
  })
  // 部分浏览器（Chromium 系）首次调用前 getVoices 列表为空，
  // 在这里注册一次 voiceschanged 以便后续 pickVoice 能拿到中文音色。
  // 同时把 zh 候选名单打印出来，方便确认是否选到了想要的甜美少女音。
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      const all = window.speechSynthesis.getVoices()
      const zh = all.filter((v) => v.lang?.toLowerCase().startsWith('zh'))
      console.info(
        '[tts] voices loaded: total=%d, zh-candidates=%d → %s',
        all.length,
        zh.length,
        zh.map((v) => v.name).join(' | ') || '(none)',
      )
    }
  }
})

const quickStarts = [
  '帮我写一首关于人工智能的诗',
  '解释一下量子计算的基本原理',
  '推荐一些提高工作效率的方法',
  '用 Python 实现一个快速排序算法',
]

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function handleNewChat() {
  // 新建会话时把录音相关状态也清掉，避免切会话后还在听
  if (isListening.value) speech.stop()
  shouldResumeListening.value = false
  chatStore.createSession()
}

async function handleEmptySend() {
  const text = emptyInputText.value.trim()
  if (!text) return
  if (!chatStore.currentSession) {
    chatStore.createSession()
  }
  inputText.value = text
  emptyInputText.value = ''
  await handleSend()
}

async function handleQuickStart(text: string) {
  if (!chatStore.currentSession) {
    chatStore.createSession()
  }
  inputText.value = text
  await handleSend()
}

async function scrollToBottom() {
  await nextTick()
  if (messagesArea.value) {
    messagesArea.value.scrollTop = messagesArea.value.scrollHeight
  }
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  // UI 维度的会话 id（用于在侧边栏分组消息 / 切换历史对话）
  // 跟后端收到的 sessionId（chatStore.sessionId，由 authStore 同步过来）是两件事：
  //  - localSessionId：仅前端 UI 用，标记"这是哪段对话"
  //  - chatStore.sessionId：实际写到 payload.sessionId 的值，必须等于后端登录返回的 sessionId
  let localSessionId = chatStore.currentSessionId
  if (!localSessionId) {
    localSessionId = chatStore.defaultSessionId
    if (localSessionId && !chatStore.sessions.find((s) => s.id === localSessionId)) {
      const defaultSession: ChatSession = {
        id: localSessionId,
        title: '默认对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      chatStore.sessions.unshift(defaultSession)
      chatStore.currentSessionId = localSessionId
    }
  }
  if (!localSessionId) {
    ElMessage.warning('会话初始化中，请稍后重试')
    return
  }

  // 后端请求里带的 sessionId：登录态下 = authStore.sessionId（与后端 /api/auth/login 返回值严格一致）
  // 未登录态下 = IP 派生的 anonymous sessionId
  // 之前这里直接用了 localSessionId，导致后端收到的 sessionId 是前端自生成的 nanoid/IP 串，
  // 跟后端登录接口返回的 sessionId 永远对不上 —— 这就是用户报"前后端 sessionId 不一致"的根因
  const wireSessionId = chatStore.sessionId || localSessionId

  // 在流式响应期间停掉录音，避免 TTS / 系统回声被识别成下一句
  if (isListening.value) {
    shouldResumeListening.value = true
    speech.stop()
  } else {
    shouldResumeListening.value = false
  }

  inputText.value = ''
  presenceText.value = '' // 重置上一轮的装饰性回应
  // 由调用方决定消息来源（语音 / 键盘），默认 text
  const source = pendingSource.value
  pendingSource.value = 'text'
  chatStore.addMessage(localSessionId, { role: 'user', content: text, source })
  await scrollToBottom()

  chatStore.isStreaming = true
  const assistantMsg = chatStore.addMessage(localSessionId, { role: 'assistant', content: '' })

  const session = chatStore.sessions.find((s) => s.id === localSessionId)
  if (!session) {
    chatStore.isStreaming = false
    return
  }

  const lastMsg = session.messages[session.messages.length - 1]
  lastMsg.content = ''

  // 启动打字机：每个 tick（25ms，最长 6 字符）把字符追加到当前 assistant 消息。
  // 关键：append 在 sink 里发生，对应的 Vue 重渲染也是按节奏的，于是产生可见的"打字"。
  startStreamingTypewriter(assistantMsg.id, (chunk) => {
    lastMsg.content += chunk
    session.updatedAt = Date.now()
    // 滚动只需要按节流；用 rAF 或定时器再触发会与 typewriter tick 重合，意义不大
    scrollToBottom()
  })

  // 同时启动"思考打字机"：model_reasoning 思考内容会逐字进入 streamingReasoningText，
  // ChatProcess.vue 读这个 ref 渲染实时思考区
  startReasoningTypewriter((chunk) => {
    streamingReasoningText.value += chunk
  })

  const messageString = session.messages
    .filter((m) => m.id !== assistantMsg.id)
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => {
      const roleLabel = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system'
      return `${roleLabel}: ${m.content}`
    })
    .join('\n\n')

  abortController = sendChatMessageStream(
    {
      model: chatStore.selectedModel,
      userId: chatStore.userId,
      sessionId: wireSessionId,
      // 把当前激活角色 ID 透传到后端，让 Python 按角色隔离记忆检索/生成。
      // 未登录 / 角色未就绪时 fallback 到 'default'（与后端默认角色对齐）。
      roleId: rolesStore.currentRoleId || 'default',
      message: messageString,
    },
    {
      onChunk: async (chunk) => {
        // 第一个 delta 到达：装饰性回应让位给真实正文
        if (presenceText.value) presenceText.value = ''
        // 推到打字机队列，由节奏器决定何时 append。**不要**直接 appendToLastAssistantMessage
        if (typewriter) typewriter.push(chunk)
      },
      // prefix 与 delta 走同一通道：拼进 assistant 消息（也走打字机）；旧级联已停用，保留兼容
      onPrefix: async (content) => {
        if (typewriter) typewriter.push(content)
      },
      // 方案A：装饰性即时回应（"我在呢~"等心跳），不进 final_text，首字到达前在气泡内展示
      onPresence: (content) => {
        presenceText.value = content
      },
      // RAG / 检索上下文摘要（persona / L0 / L1 计数）
      onContext: (info) => {
        chatStore.appendMessageContext(localSessionId, info)
      },
      // 工具调用：单条 tool 帧触发一次
      onTool: (toolCall) => {
        chatStore.appendMessageToolCalls(localSessionId, [toolCall])
      },
      // 附件资源：每条 resource 帧单条追加，store 内按 fileId+chunkIndex 去重
      onResource: async (resource) => {
        chatStore.appendMessageResource(localSessionId, resource)
        await scrollToBottom()
      },
      // 长期记忆：仅 toast 提示，不入消息气泡（store 仍有留存以便排查）
      onMemory: (result) => {
        chatStore.appendMessageMemoryResult(localSessionId, result)
        if (result.ok) ElMessage.success('已提取长期记忆')
        else ElMessage.warning(`长期记忆提取失败${result.error ? `：${result.error}` : ''}`)
      },
      // 思考过程：按时间顺序累积到 assistant 消息的 thinkings[] 字段，
      // UI 折叠面板里展示"AI 在做什么"。
      // model_reasoning 阶段的正文（模型真实思考内容）额外走打字机，
      // 让"模型思考"区也能像回答一样逐字呈现（DeepSeek 风格）。
      onThinking: (ev) => {
        chatStore.appendMessageThinking(localSessionId, ev)
        if (ev.stage === 'model_reasoning') {
          pushReasoning(ev.text)
        }
        scrollToBottom()
      },
      // 回忆检索命中详情：覆盖写入 memoryRecall（一次响应通常一次）
      onRecall: (info) => {
        chatStore.appendMessageMemoryRecall(localSessionId, info)
        scrollToBottom()
      },
      // M2:三桶心情实时更新（驱动 PixelCharacter + MoodIndicator）
      onMoodUpdate: (m) => {
        chatStore.updateMood(m)
        // 心情变化时,滚动到底部确保 mood chip 可见
        scrollToBottom()
      },
      onDone: () => {
        // 收尾：先把打字机里剩余的字符 flush，再走 TTS / 恢复录音的逻辑，
        // 避免 tts.speak(lastMsg.content) 拿到截断的文本。
        stopStreamingTypewriter(true, (rest) => {
          lastMsg.content += rest
        })
        // 收尾：思考打字机也 flush，确保已排队字符全部显示
        stopReasoningTypewriter(true)
        presenceText.value = '' // 装饰性回应随流式结束清空
        chatStore.isStreaming = false
        abortController = null
        // 流式完成：若开启了自动播报，朗读最后一条 assistant 消息
        // 像素人物模式下只要开启了自动语音对话就强制播报
        const shouldSpeak =
          (autoPlay.value || (chatMode.value === 'pixel' && pixelAutoListen.value)) &&
          lastMsg &&
          lastMsg.content.trim()
        if (shouldSpeak) {
          speakingId.value = lastMsg.id
          console.info('[chat] SSE done, playing new TTS for msg=%s', lastMsg.id)
          tts.speak(lastMsg.content)
        } else {
          // 不播报的情况下直接恢复录音
          resumeListeningIfNeeded()
        }
      },
      onError: (error) => {
        // 出错也要把已排队的字符先 drain，让用户至少能看到已收到的部分回复
        stopStreamingTypewriter(true, (rest) => {
          lastMsg.content += rest
        })
        stopReasoningTypewriter(true)
        chatStore.isStreaming = false
        abortController = null
        ElMessage.error(`请求失败: ${error.message}`)
        // 失败时也恢复录音
        resumeListeningIfNeeded()
      },
    },
  )
}

function handleStop() {
  abortController?.abort()
  // 手动停流：先把打字机里已排队的字符 flush 到消息上，避免 UI 卡在 90% 文本上
  const session = chatStore.currentSession
  const lastMsg = session?.messages[session.messages.length - 1]
  stopStreamingTypewriter(true, lastMsg ? (rest) => (lastMsg.content += rest) : undefined)
  stopReasoningTypewriter(true)
  chatStore.isStreaming = false
  abortController = null
  // 手动停流：onDone 不会触发，这里手动决定是否恢复录音
  resumeListeningIfNeeded()
}

async function handleCopy(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function handleRetry(msg: Message) {
  const sessionId = chatStore.currentSessionId
  if (!sessionId || chatStore.isStreaming) return

  const session = chatStore.sessions.find((s) => s.id === sessionId)
  if (!session) return

  // 重试时若原消息是语音，保持来源标记
  pendingSource.value = msg.source ?? 'text'
  inputText.value = msg.content
  await handleSend()
}

function handleEdit(msg: Message) {
  editingMessageId.value = msg.id
  editingText.value = msg.content
}

async function handleSaveEdit(msgId: string) {
  const newContent = editingText.value.trim()
  if (!newContent) return

  const sessionId = chatStore.currentSessionId
  if (!sessionId) return

  const session = chatStore.sessions.find((s) => s.id === sessionId)
  if (!session) return

  const msgIndex = session.messages.findIndex((m) => m.id === msgId)
  if (msgIndex === -1) return

  const original = session.messages[msgIndex]
  // 编辑后保留原来源标记
  pendingSource.value = original.source ?? 'text'

  original.content = newContent
  editingMessageId.value = null
  editingText.value = ''

  session.messages.splice(msgIndex, 1)
  if (msgIndex < session.messages.length && session.messages[msgIndex].role === 'assistant') {
    session.messages.splice(msgIndex, 1)
  }

  inputText.value = newContent
  await handleSend()
}

function handleCancelEdit() {
  editingMessageId.value = null
  editingText.value = ''
}

watch(
  () => chatStore.currentSessionId,
  async () => {
    await scrollToBottom()
  },
)

/* ========================================================================
 * 像素人物模式（额外逻辑）
 * ====================================================================== */

/** 像素模式是否处于"自动开启录音"的状态 */
const pixelAutoListen = ref(false)
/** 历史对话抽屉是否打开 */
const historyOpen = ref(false)
/** 字幕区当前应该展示谁的台词：user | echo | placeholder */
type SubtitleSpeaker = 'user' | 'echo' | 'placeholder'
const activeSubtitle = ref<SubtitleSpeaker>('placeholder')

/** 角色尺寸：根据视口高度自适应 */
const characterSize = computed(() => {
  // 取窗口高度的 0.45-0.6 之间作为角色高度上限，再换算成宽度
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return Math.max(180, Math.min(360, Math.round(h * 0.5)))
})

/** 格式化时间戳 HH:MM */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 历史对话列表（派生自当前会话的消息） */
const historyList = computed(() => {
  const s = chatStore.currentSession
  if (!s) return []
  return s.messages
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      source: m.source,
      time: formatTime(m.createdAt),
    }))
})

/** 切换历史抽屉 */
function toggleHistory() {
  historyOpen.value = !historyOpen.value
  console.info('[chat] history drawer -> %s', historyOpen.value ? 'open' : 'closed')
}

/** 决定当前字幕区应该显示哪一方 */
function decideSubtitle(): SubtitleSpeaker {
  if (chatStore.isStreaming || isPixelTalking.value) return 'echo'
  if (isListening.value || displayInterim.value) return 'user'
  // 用户刚发了消息但 Echo 还没开始回复
  if (pixelUserText.value && !pixelDialogue.value) return 'user'
  return 'placeholder'
}

watch(
  [() => chatStore.isStreaming, tts.isSpeaking, isListening, displayInterim, pixelUserText, pixelDialogue],
  () => {
    activeSubtitle.value = decideSubtitle()
  },
  { immediate: true },
)

/** 切换对话模式 */
function handleSwitchMode(mode: ChatMode) {
  if (chatMode.value === mode) return
  chatMode.value = mode
  try {
    localStorage.setItem(CHAT_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
  console.info('[chat] switch mode -> %s', mode)
  // 切到像素模式：自动开启语音监听；切回文本模式：关闭
  // 监听 chatMode 的 watcher (immediate) 会负责启停，这里只需兜底
  if (mode === 'text') {
    stopPixelAutoListen()
  }
}

/** 像素模式：开启自动语音监听 */
function startPixelAutoListen() {
  if (!speech.isSupported.value) {
    ElMessage.warning('当前浏览器不支持语音识别')
    return
  }
  if (isListening.value) return
  pixelAutoListen.value = true
  speech.reset()
  speech.start()
  pixelState.value = 'listen'
  console.info('[pixel] auto voice listening started')
}

/** 像素模式：关闭自动语音监听 */
function stopPixelAutoListen() {
  pixelAutoListen.value = false
  if (isListening.value) speech.stop()
  if (pixelState.value === 'listen' || pixelState.value === 'idle') {
    pixelState.value = 'idle'
  }
  console.info('[pixel] auto voice listening stopped')
}

/**
 * 把情绪转换成像素人物的状态。
 * 规则：兴奋→excited；开心→happy；悲伤→sad；其余→talk。
 * 同时把状态推送给 UI 标签。
 */
function applyEmotionToPixel(text: string) {
  const emotion = detectEmotion(text)
  lastEmotion.value = emotion
  switch (emotion) {
    case 'excited':
      pixelState.value = 'excited'
      break
    case 'happy':
      pixelState.value = 'happy'
      break
    case 'sad':
      pixelState.value = 'sad'
      break
    case 'angry':
      pixelState.value = 'sad'
      break
    default:
      pixelState.value = 'talk'
  }
  console.info('[pixel] emotion=%s, state=%s', emotion, pixelState.value)
}

/**
 * 像素模式：流式响应期间，把累积到的文本投影到气泡上
 */
watch(
  () => {
    const s = chatStore.currentSession
    if (!s) return ''
    const last = s.messages[s.messages.length - 1]
    return last?.role === 'assistant' ? last.content : ''
  },
  (v) => {
    if (chatMode.value === 'pixel') pixelDialogue.value = v
  },
)

/**
 * 像素模式：监听 TTS 状态。
 * - TTS 朗读中：像素人物进入 talk 状态 + 嘴巴开合
 * - TTS 结束后：进入 idle（如果开了 autoListen 则恢复录音）
 */
watch(tts.isSpeaking, (v) => {
  if (chatMode.value !== 'pixel') return
  isPixelTalking.value = v
  if (v) {
    // 朗读中维持 talk 状态（情绪化由 applyEmotionToPixel 已设）
    if (pixelState.value !== 'happy' && pixelState.value !== 'excited' && pixelState.value !== 'sad') {
      pixelState.value = 'talk'
    }
  } else {
    // 朗读结束：恢复 idle / 重新开启录音
    if (pixelAutoListen.value && !chatStore.isStreaming) {
      nextTick(() => {
        if (!isListening.value) {
          speech.reset()
          speech.start()
        }
        pixelState.value = 'listen'
      })
    } else {
      pixelState.value = 'idle'
    }
  }
})

/** 像素模式：监听识别状态，决定是否显示"倾听中" */
watch(isListening, (v) => {
  if (chatMode.value !== 'pixel') return
  if (v) {
    if (pixelState.value !== 'happy' && pixelState.value !== 'excited' && pixelState.value !== 'sad' && pixelState.value !== 'talk') {
      pixelState.value = 'listen'
    }
  } else {
    // 录音停：进入 idle，但 keep autoListen 意图
    if (pixelState.value === 'listen') pixelState.value = 'idle'
  }
})

/** 像素模式：监听流式状态，开始时进入 thinking（眼睛朝下看） */
watch(
  () => chatStore.isStreaming,
  (v) => {
    if (chatMode.value !== 'pixel') return
    if (v) {
      // 流式中：如果是 talk 状态说明在播报；否则显示思考中
      if (!tts.isSpeaking.value) pixelState.value = 'thinking'
    } else {
      // 流式结束：handleSend 内部已设置播报，由 tts.isSpeaking watcher 接管
      // 不主动重置
    }
  },
)

/** 像素模式进入后，自动开启录音（首屏时） */
watch(
  chatMode,
  (v) => {
    if (v === 'pixel') {
      nextTick(() => {
        // 等组件挂载好再启动
        if (!isListening.value) startPixelAutoListen()
      })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopPixelAutoListen()
  tts.stop()
  if (isListening.value) speech.stop()
})

/**
 * 覆盖 handleSend 中的播报分支：流式结束后在像素模式下自动播报并应用情绪
 * （保持原文本模式行为不变：autoPlay 开 → TTS 播报）
 *
 * 关键点：原 handleSend 的 onDone 回调只判断 autoPlay。
 * 在像素模式下我们强制播报（pixelAutoListen 必然要求听到对方回复），
 * 同时通过 applyEmotionToPixel 设置像素人物的状态。
 */
// 通过 watch 拦截流式完成的"播报"分支：原 onDone 在 autoPlay=true 时调 tts.speak，
// 我们在这里加 emotion 应用。简单做法：覆写 tts.speak 的回调时机。
watch(
  () => tts.isSpeaking.value,
  (v) => {
    if (!v) return
    // TTS 开始时立即识别情绪
    const s = chatStore.currentSession
    if (!s) return
    const last = s.messages[s.messages.length - 1]
    if (last && last.role === 'assistant' && last.content.trim()) {
      applyEmotionToPixel(last.content)
    }
  },
)

/** 同步最近一条 user 消息到 pixelUserText，用于气泡显示 */
watch(
  () => {
    const s = chatStore.currentSession
    if (!s) return null
    // 倒序查找最后一条 user 消息
    for (let i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === 'user') return s.messages[i]
    }
    return null
  },
  (msg) => {
    if (!msg) {
      pixelUserText.value = ''
      return
    }
    pixelUserText.value = msg.content
  },
  { immediate: true },
)

/** 像素模式：手动停止当前播报 */
function handlePixelStopSpeak() {
  tts.stop()
  pixelState.value = 'idle'
  if (pixelAutoListen.value) {
    nextTick(() => {
      if (!isListening.value) {
        speech.reset()
        speech.start()
      }
    })
  }
}

/* ---- 像素模式 UI 文案 ---- */
const pixelStateLabel = computed(() => {
  switch (pixelState.value) {
    case 'idle':
      return '待机'
    case 'listen':
      return '聆听中'
    case 'talk':
      return '回复中'
    case 'happy':
      return '开心'
    case 'sad':
      return '低落'
    case 'excited':
      return '兴奋'
    case 'greet':
      return '打招呼'
    case 'thinking':
      return '思考中'
    default:
      return '待机'
  }
})

const pixelHint = computed(() => {
  if (chatStore.isStreaming && !tts.isSpeaking.value) return 'Echo 正在思考…'
  if (isPixelTalking.value) return 'Echo 正在说话…'
  if (isListening.value) return '正在聆听… 说完自动发送'
  if (pixelAutoListen.value) return '语音对话已开启 · 说话即可'
  return '点击「语音开」开启语音对话'
})

const placeholderHint = computed(() => {
  if (!speech.isSupported.value) return '当前浏览器不支持语音识别，请使用键盘输入。'
  return '嗨～我是 Echo，说点什么试试看？'
})
</script>

<style scoped>
.echo-layout {
  display: flex;
  height: 100%;
  background-color: #1a1a1a;
  color: #fff;
  position: relative;
}

/* Sidebar */
.echo-sidebar {
  width: clamp(15rem, 18vw, 18rem);
  flex-shrink: 0;
  background: #252525;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.3s ease;
}

.echo-sidebar.is-collapsed {
  width: 0;
  border-right: none;
}

.sidebar-header {
  padding: clamp(0.75rem, 1.2vw, 1rem);
}

.new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  border: none;
  background: #165dff;
  color: #fff;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.new-chat-btn:hover {
  background: #3a7aff;
}

/* 模式切换器（文本 / 像素） */
.mode-switcher {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
  margin-top: 0.6rem;
  padding: 0.3rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.6rem;
}

.mode-switcher__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.4rem 0.5rem;
  border-radius: 0.45rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: clamp(0.72rem, 0.85vw, 0.8rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-switcher__btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.mode-switcher__btn--active {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.85), rgba(91, 141, 239, 0.85));
  color: #fff;
  box-shadow: 0 0.25rem 0.6rem rgba(22, 93, 255, 0.35);
}

.mode-switcher__btn--active:hover {
  background: linear-gradient(135deg, #3a7aff, #5b8def);
  color: #fff;
}

.mode-switcher__btn .el-icon {
  font-size: 0.95rem;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.85rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background-color 0.15s;
  position: relative;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.session-item--active {
  background: rgba(22, 93, 255, 0.15);
}

.session-icon {
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item--active .session-title {
  color: #fff;
}

.session-delete {
  width: clamp(1.2rem, 1.5vw, 1.5rem);
  height: clamp(1.2rem, 1.5vw, 1.5rem);
  border-radius: 0.4rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  opacity: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}

.session-item:hover .session-delete {
  opacity: 1;
}

.session-delete:hover {
  background: rgba(245, 63, 63, 0.2);
  color: #f56c6c;
}

.sessions-empty {
  padding: clamp(1.25rem, 2vw, 2rem) 1rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: clamp(0.8rem, 1vw, 0.95rem);
}

/* Sidebar toggle */
.sidebar-toggle {
  position: absolute;
  left: clamp(15rem, 18vw, 18rem);
  top: 50%;
  transform: translateY(-50%);
  width: clamp(1.2rem, 1.6vw, 1.5rem);
  height: clamp(2.5rem, 3.2vw, 3rem);
  background: #333;
  border: none;
  border-radius: 0 0.4rem 0.4rem 0;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: left 0.3s ease, background-color 0.2s;
  z-index: 100;
}

.sidebar-toggle:hover {
  background: #444;
  color: #fff;
}

.echo-sidebar.is-collapsed + .sidebar-toggle {
  left: 0;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1a1a1a;
}

/* Empty state */
.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1rem, 2vw, 1.5rem);
}

.empty-content {
  text-align: center;
  max-width: 35rem;
}

.empty-title {
  font-size: clamp(1.75rem, 3.5vw, 2.6rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
  letter-spacing: 0.5em;
}

.empty-subtitle {
  font-size: clamp(0.85rem, 1.1vw, 1rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 1.5rem;
}

.empty-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  background: #333;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: clamp(1rem, 1.8vw, 1.5rem);
  padding: clamp(0.5rem, 1vw, 0.75rem) clamp(0.75rem, 1.4vw, 1rem) clamp(0.5rem, 1vw, 0.75rem) clamp(1rem, 1.8vw, 1.4rem);
  margin-bottom: 1rem;
  max-width: 45rem;
  margin-left: auto;
  margin-right: auto;
}

.empty-input-wrapper:focus-within {
  border-color: rgba(22, 93, 255, 0.5);
}

.empty-input-wrapper--recording {
  border-color: rgba(245, 63, 63, 0.5);
}

.empty-input {
  flex: 1;
}

:deep(.empty-input .el-textarea__inner) {
  background: transparent;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.95);
  font-size: clamp(0.85rem, 1.1vw, 1rem);
  line-height: 1.6;
  box-shadow: none;
  resize: none;
}

:deep(.empty-input .el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.empty-input-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* 空状态下的自动播报开关：与主态风格保持一致 */
.empty-autoplay-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: clamp(2rem, 2.5vw, 2.4rem);
  padding: 0 0.7rem;
  margin-right: 0.4rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.55);
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  white-space: nowrap;
}

.empty-autoplay-btn .el-icon {
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
}

.empty-autoplay-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
}

.empty-autoplay-btn--on {
  background: rgba(22, 93, 255, 0.18);
  border-color: rgba(22, 93, 255, 0.5);
  color: #a9c3ff;
}

.empty-autoplay-btn--on:hover {
  background: rgba(22, 93, 255, 0.3);
  color: #fff;
}

.empty-mic-btn {
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  transition: all 0.2s;
  margin-right: 0.4rem;
  flex-shrink: 0;
}

.empty-mic-btn:not(.empty-mic-btn--disabled):hover {
  background: rgba(22, 93, 255, 0.3);
  color: #fff;
}

.empty-mic-btn--recording {
  background: rgba(245, 63, 63, 0.25);
  color: #f56c6c;
  animation: mic-pulse 1.4s ease-in-out infinite;
}

.empty-mic-btn--recording:hover {
  background: rgba(245, 63, 63, 0.4);
}

.empty-mic-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-send-btn {
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  background: #165dff;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.empty-send-btn:disabled {
  background: rgba(22, 93, 255, 0.4);
  cursor: not-allowed;
}

.empty-send-btn:not(:disabled):hover {
  background: #3a7aff;
}

.quick-starts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: center;
  align-items: center;
}

.quick-start-btn {
  padding: 0.5rem 0.85rem;
  border-radius: 1rem;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  cursor: pointer;
  transition: all 0.2s;
}

.quick-start-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
}

/* Messages */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: clamp(0.85rem, 1.8vw, 1.5rem) 0;
}

.messages-inner {
  max-width: 55rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: clamp(0.85rem, 1.8vw, 1.5rem);
}

.message-wrapper {
  display: flex;
  gap: clamp(0.6rem, 1.2vw, 1rem);
  padding: 0 clamp(0.85rem, 1.8vw, 1.5rem);
}

.message-wrapper--user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: clamp(1.8rem, 2.5vw, 2.3rem);
  height: clamp(1.8rem, 2.5vw, 2.3rem);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.85rem, 1.05vw, 1rem);
  flex-shrink: 0;
  background: #333;
  color: rgba(255, 255, 255, 0.7);
}

/* AI 助手头像：渐变圆形容器，让 SVG 完整居中渲染 */
.ai-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0.18rem 0.5rem rgba(22, 93, 255, 0.35);
}

.ai-avatar svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* 用户头像容器：保留原灰色圆形 */
.message-wrapper--user .message-avatar {
  background: linear-gradient(135deg, #165dff, #5b8def);
  color: #fff;
}

.message-bubble {
  max-width: 70%;
  padding: clamp(0.6rem, 1.1vw, 0.9rem) clamp(0.85rem, 1.3vw, 1.15rem);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  font-size: clamp(0.8rem, 1.05vw, 0.95rem);
  line-height: 1.7;
}

.message-bubble--user {
  background: #165dff;
  color: #fff;
  border-bottom-right-radius: 0.25rem;
}

.message-bubble--assistant {
  background: #2a2a2a;
  color: rgba(255, 255, 255, 0.9);
  border-bottom-left-radius: 0.25rem;
}

.message-actions {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-wrapper:hover .message-actions {
  opacity: 1;
}

.action-btn {
  width: clamp(1.5rem, 1.9vw, 1.85rem);
  height: clamp(1.5rem, 1.9vw, 1.85rem);
  border-radius: 0.4rem;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.action-btn--retry {
  color: #e6a23c;
}

.action-btn--retry:hover {
  background: rgba(245, 108, 108, 0.2);
  color: #f56c6c;
}

.edit-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 12rem;
}

.edit-input {
  width: 100%;
}

:deep(.edit-input .el-textarea__inner) {
  background: rgba(22, 93, 255, 0.2);
  border: 1px solid rgba(22, 93, 255, 0.4);
  color: #fff;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.edit-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 0.4rem;
  border: none;
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn--cancel {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.edit-btn--cancel:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.edit-btn--save {
  background: #165dff;
  color: #fff;
}

.edit-btn--save:hover {
  background: #3a7aff;
}

.message-content :deep(code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  font-family: monospace;
}

.message-content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
}

/* Streaming dots */
.streaming-dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  animation: pulse 1.4s ease-in-out infinite;
  margin: 0 0.2rem;
}

/* 方案A：装饰性即时回应（presence）——柔和、斜体，像"对方正在回应"的轻声提示 */
.message-presence {
  display: inline-block;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
  letter-spacing: 0.5px;
  animation: presence-fade-in 0.25s ease-out;
}

@keyframes presence-fade-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 打字机光标：渲染在 .message-content 末尾，仅在 streamingMessageId 命中时出现 */
.typing-caret {
  display: inline-block;
  margin-left: 1px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  animation: typing-caret-blink 1s steps(2, start) infinite;
  /* 让光标在字符流的同一个 inline 区间内显示 */
  vertical-align: baseline;
}

@keyframes typing-caret-blink {
  to {
    opacity: 0;
  }
}

.streaming-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Input */
.input-area {
  padding: clamp(0.6rem, 1.2vw, 1rem) clamp(0.85rem, 1.8vw, 1.5rem) clamp(0.85rem, 1.8vw, 1.5rem);
}

.input-wrapper {
  max-width: 55rem;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  background: #333;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  padding: 0.6rem 0.75rem 0.6rem 1.1rem;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: rgba(22, 93, 255, 0.5);
}

.chat-input {
  flex: 1;
}

:deep(.chat-input .el-textarea__inner) {
  background: transparent;
  border: none;
  padding: 0.4rem 0;
  color: rgba(255, 255, 255, 0.95);
  font-size: clamp(0.85rem, 1.1vw, 1rem);
  line-height: 1.6;
  box-shadow: none;
  resize: none;
}

:deep(.chat-input .el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.input-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* 自动播报开关：放在麦克风左侧，文本按钮形态 */
.autoplay-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: clamp(2rem, 2.5vw, 2.4rem);
  padding: 0 0.7rem;
  margin-right: 0.4rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.55);
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  white-space: nowrap;
}

.autoplay-btn .el-icon {
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
}

.autoplay-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
}

.autoplay-btn--on {
  background: rgba(22, 93, 255, 0.18);
  border-color: rgba(22, 93, 255, 0.5);
  color: #a9c3ff;
}

.autoplay-btn--on:hover {
  background: rgba(22, 93, 255, 0.3);
  color: #fff;
}

.send-btn,
.stop-btn {
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  transition: all 0.2s;
}

.send-btn {
  background: #165dff;
  color: #fff;
}

.send-btn:disabled {
  background: rgba(22, 93, 255, 0.4);
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  background: #3a7aff;
}

.stop-btn {
  background: rgba(245, 63, 63, 0.2);
  color: #f56c6c;
}

.stop-btn:hover {
  background: rgba(245, 63, 63, 0.3);
}

.message-image {
  margin-top: 0.75rem;
  border-radius: 0.75rem;
  overflow: hidden;
  max-width: 28rem;
}

/* 附件列表（图片 / 文件混合） */
.message-attachments {
  margin-top: 0.5rem;
}

.chat-image {
  width: 100%;
  border-radius: 0.75rem;
}

/* ===================== 语音相关样式 ===================== */

/* 输入框左下角：录音中提示 */
.recording-hint {
  max-width: 55rem;
  margin: 0.4rem auto 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(245, 63, 63, 0.08);
  border: 1px solid rgba(245, 63, 63, 0.35);
  color: rgba(255, 255, 255, 0.85);
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  overflow: hidden;
}

/* 空状态下的录音提示：紧贴输入框下方，宽度跟随 .empty-input-wrapper */
.recording-hint--empty {
  max-width: 45rem;
  margin: 0.5rem auto 0.75rem;
}

.recording-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #f56c6c;
  flex-shrink: 0;
  animation: pulse 1.2s ease-in-out infinite;
}

.recording-label {
  color: #f56c6c;
  font-weight: 500;
  flex-shrink: 0;
}

.recording-interim {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.75);
}

.recording-interim--placeholder {
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
}

.recording-abort-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
  flex-shrink: 0;
  padding: 0.25rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(245, 63, 63, 0.45);
  background: rgba(245, 63, 63, 0.12);
  color: #ffb3b3;
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.recording-abort-btn:hover {
  background: rgba(245, 63, 63, 0.25);
  border-color: rgba(245, 63, 63, 0.7);
  color: #fff;
}

.recording-abort-btn .el-icon {
  font-size: 0.95rem;
}

.input-wrapper--recording {
  border-color: rgba(245, 63, 63, 0.5);
}

/* 麦克风按钮 */
.mic-btn {
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  transition: all 0.2s;
  margin-right: 0.4rem;
  flex-shrink: 0;
}

.mic-btn:not(.mic-btn--disabled):not(:disabled):hover {
  background: rgba(22, 93, 255, 0.3);
  color: #fff;
}

.mic-btn--recording {
  background: rgba(245, 63, 63, 0.25);
  color: #f56c6c;
  animation: mic-pulse 1.4s ease-in-out infinite;
}

.mic-btn--recording:hover {
  background: rgba(245, 63, 63, 0.4);
}

.mic-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mic-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes mic-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(245, 63, 63, 0.55);
  }
  50% {
    box-shadow: 0 0 0 0.5rem rgba(245, 63, 63, 0);
  }
}

/* 用户消息内的语音块：播报按钮 + 文本框 */
.voice-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 12rem;
  max-width: 100%;
}

.voice-block__header {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: clamp(0.7rem, 0.85vw, 0.78rem);
  color: rgba(255, 255, 255, 0.75);
  opacity: 0.85;
}

.voice-block__icon {
  font-size: 0.9rem;
}

.voice-block__label {
  font-weight: 500;
  letter-spacing: 0.02em;
}

.voice-play-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: clamp(0.75rem, 0.9vw, 0.85rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.voice-play-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.55);
}

.voice-play-btn--playing {
  background: rgba(245, 63, 63, 0.25);
  border-color: rgba(245, 63, 63, 0.55);
  color: #ffd5d5;
}

.voice-play-btn--playing:hover {
  background: rgba(245, 63, 63, 0.35);
}

.voice-text-box {
  width: 100%;
  min-width: 12rem;
  max-width: 28rem;
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(0.8rem, 1vw, 0.92rem);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
}

/* ===================== 像素人物模式（全屏重做版） ===================== */
.chat-mode {
  display: contents;
}

.chat-mode--pixel {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* 全屏背景：场景组件 absolute 覆盖 */
.pixel-mode__scene {
  position: absolute !important;
  inset: 0;
  z-index: 0;
}

/* 顶部浮动条 */
.pixel-topbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: clamp(0.6rem, 1.2vw, 0.9rem) clamp(0.85rem, 1.8vw, 1.4rem);
  flex-shrink: 0;
}

.pixel-state-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.85rem;
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: clamp(0.72rem, 0.85vw, 0.8rem);
  color: rgba(255, 255, 255, 0.92);
  font-weight: 500;
  box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.25);
}

.pixel-state-chip__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #5a5a6a;
  box-shadow: 0 0 0.4rem currentColor;
}

.pixel-state-chip__dot--listen {
  background: #ff5577;
  color: #ff5577;
  animation: pixel-dot-pulse 1.2s ease-in-out infinite;
}
.pixel-state-chip__dot--talk {
  background: #5b8def;
  color: #5b8def;
  animation: pixel-dot-pulse 0.7s ease-in-out infinite;
}
.pixel-state-chip__dot--happy,
.pixel-state-chip__dot--excited {
  background: #ffb347;
  color: #ffb347;
}
.pixel-state-chip__dot--sad {
  background: #9aa3c0;
  color: #9aa3c0;
}
.pixel-state-chip__dot--thinking {
  background: #a78bfa;
  color: #a78bfa;
  animation: pixel-dot-pulse 1.5s ease-in-out infinite;
}
.pixel-state-chip__dot--greet {
  background: #4ade80;
  color: #4ade80;
}
.pixel-state-chip__dot--idle {
  background: #5a5a6a;
  color: #5a5a6a;
}

@keyframes pixel-dot-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.4);
    opacity: 0.6;
  }
}

.pixel-topbar__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.pixel-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.7rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.7);
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.pixel-mini-btn:hover {
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.35);
}

.pixel-mini-btn--on {
  background: rgba(22, 93, 255, 0.35);
  border-color: rgba(22, 93, 255, 0.6);
  color: #d6e4ff;
}

.pixel-mini-btn--on:hover {
  background: rgba(22, 93, 255, 0.5);
  color: #fff;
}

.pixel-mini-btn--danger {
  background: rgba(245, 63, 63, 0.3);
  border-color: rgba(245, 63, 63, 0.6);
  color: #ffd5d5;
  animation: mic-pulse 1.4s ease-in-out infinite;
}

.pixel-mini-btn .el-icon {
  font-size: 0.95rem;
}

/* 角色居中区 */
.pixel-mode__character-wrap {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  gap: 0.4rem;
  padding: 0.5rem;
}

.pixel-mode__character {
  filter: drop-shadow(0 1rem 2rem rgba(0, 0, 0, 0.45));
  max-height: 100%;
  max-width: 100%;
}

.pixel-mode__hint {
  font-size: clamp(0.78rem, 0.95vw, 0.9rem);
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  padding: 0.35rem 0.8rem;
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  line-height: 1.5;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

/* 字幕区（对白气泡） */
.pixel-mode__dialogue {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  min-height: clamp(5rem, 12vh, 8rem);
  padding: 0 clamp(0.85rem, 1.8vw, 1.4rem) clamp(0.5rem, 1vw, 0.8rem);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.subtitle {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  max-width: min(48rem, 95%);
  width: 100%;
}

.subtitle--user {
  justify-content: flex-start;
}

.subtitle--echo {
  justify-content: flex-end;
  flex-direction: row-reverse;
}

.subtitle--placeholder {
  justify-content: center;
}

.subtitle__avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  background: linear-gradient(135deg, #5b8def, #165dff);
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 0.25rem 0.5rem rgba(0, 0, 0, 0.3);
}

.subtitle__avatar--echo {
  background: linear-gradient(135deg, #ff8db5, #d9667c);
}

.subtitle__bubble {
  padding: 0.55rem 0.85rem;
  border-radius: 0.8rem;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.95);
  font-size: clamp(0.85rem, 1.05vw, 0.98rem);
  line-height: 1.5;
  min-width: 5rem;
  max-width: 100%;
  box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.35);
  position: relative;
}

.subtitle--user .subtitle__bubble {
  border-bottom-left-radius: 0.25rem;
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.85), rgba(91, 141, 239, 0.85));
}

.subtitle--echo .subtitle__bubble--echo {
  border-bottom-right-radius: 0.25rem;
  background: linear-gradient(135deg, rgba(217, 102, 124, 0.85), rgba(255, 141, 181, 0.85));
}

.subtitle--placeholder .subtitle__bubble--placeholder {
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  text-align: center;
  font-style: italic;
  color: rgba(255, 255, 255, 0.7);
}

.subtitle__name {
  font-size: clamp(0.65rem, 0.75vw, 0.7rem);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.75;
  margin-bottom: 0.15rem;
}

.subtitle--user .subtitle__name {
  text-align: left;
}

.subtitle--echo .subtitle__name {
  text-align: right;
}

.subtitle__content {
  word-break: break-word;
  white-space: pre-wrap;
}

.subtitle__content :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.05rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.92em;
  font-family: monospace;
}

.subtitle__content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  overflow-x: auto;
  margin: 0.4rem 0;
}

.subtitle__placeholder {
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
}

.subtitle__thinking {
  color: rgba(255, 255, 255, 0.8);
  font-style: italic;
  animation: subtitle-thinking 1.2s ease-in-out infinite;
}

@keyframes subtitle-thinking {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

/* 字幕切换动画 */
.subtitle-fade-enter-active,
.subtitle-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.subtitle-fade-enter-from {
  opacity: 0;
  transform: translateY(0.6rem);
}
.subtitle-fade-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem);
}

/* 录音提示条 */
.pixel-recording {
  position: absolute;
  z-index: 4;
  left: 50%;
  bottom: clamp(5.5rem, 11vh, 7rem);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  border-radius: 0.7rem;
  background: rgba(245, 63, 63, 0.18);
  border: 1px solid rgba(245, 63, 63, 0.5);
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(0.78rem, 0.95vw, 0.9rem);
  max-width: min(40rem, 90%);
  overflow: hidden;
  box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ====== 历史抽屉 ====== */
.history-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.history-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(28rem, 90%);
  z-index: 10;
  background: linear-gradient(180deg, #1a1a26 0%, #14141d 100%);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -0.5rem 0 2rem rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  color: #fff;
}

.history-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.history-drawer__title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.history-drawer__title .el-icon {
  font-size: 1.05rem;
  color: #5b8def;
}

.history-drawer__close {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 0.4rem;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.history-drawer__close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.history-drawer__meta {
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 1rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.history-drawer__list {
  flex: 1;
  overflow-y: auto;
  padding: 0.6rem 1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.history-drawer__empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  padding: 2.5rem 1rem;
  font-size: 0.85rem;
}

.history-drawer__empty p {
  margin: 0.2rem 0;
}

.history-drawer__hint {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.3);
}

.history-item {
  padding: 0.6rem 0.75rem;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.history-item--user {
  background: rgba(22, 93, 255, 0.1);
  border-color: rgba(22, 93, 255, 0.25);
}

.history-item--assistant {
  background: rgba(217, 102, 124, 0.08);
  border-color: rgba(217, 102, 124, 0.2);
}

.history-item__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.6);
}

.history-item__name {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.history-item__time {
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
  font-size: 0.7rem;
}

.history-item__tag {
  font-size: 0.65rem;
  padding: 0.05rem 0.35rem;
  border-radius: 0.3rem;
  background: rgba(91, 141, 239, 0.2);
  color: #a9c3ff;
}

.history-item__content {
  font-size: 0.85rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.92);
  white-space: pre-wrap;
  word-break: break-word;
}

.history-item__content :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.05rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.9em;
  font-family: monospace;
}

.history-item__content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  overflow-x: auto;
  margin: 0.4rem 0;
}

/* 抽屉滑入/淡入动画 */
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.3s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}

/* ====== 旧版兼容样式（保留以防引用） ====== */
.pixel-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: clamp(0.75rem, 1.6vw, 1.25rem) clamp(0.85rem, 1.8vw, 1.5rem);
  gap: 0.75rem;
  background: radial-gradient(ellipse at top, #1f2540 0%, #14141d 60%, #0f0f17 100%);
  overflow: hidden;
}

.pixel-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.pixel-state-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.7rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.pixel-state-chip__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #5a5a6a;
  box-shadow: 0 0 0.4rem currentColor;
}

.pixel-state-chip__dot--listen {
  background: #ff5577;
  color: #ff5577;
  animation: pixel-dot-pulse 1.2s ease-in-out infinite;
}
.pixel-state-chip__dot--talk {
  background: #5b8def;
  color: #5b8def;
  animation: pixel-dot-pulse 0.7s ease-in-out infinite;
}
.pixel-state-chip__dot--happy,
.pixel-state-chip__dot--excited {
  background: #ffb347;
  color: #ffb347;
}
.pixel-state-chip__dot--sad {
  background: #9aa3c0;
  color: #9aa3c0;
}
.pixel-state-chip__dot--thinking {
  background: #a78bfa;
  color: #a78bfa;
  animation: pixel-dot-pulse 1.5s ease-in-out infinite;
}
.pixel-state-chip__dot--greet {
  background: #4ade80;
  color: #4ade80;
}
.pixel-state-chip__dot--idle {
  background: #5a5a6a;
  color: #5a5a6a;
}

@keyframes pixel-dot-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.4);
    opacity: 0.6;
  }
}

.pixel-topbar__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.pixel-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.6rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  font-size: clamp(0.7rem, 0.85vw, 0.78rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.pixel-mini-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.pixel-mini-btn--on {
  background: rgba(22, 93, 255, 0.18);
  border-color: rgba(22, 93, 255, 0.5);
  color: #a9c3ff;
}

.pixel-mini-btn--on:hover {
  background: rgba(22, 93, 255, 0.3);
  color: #fff;
}

.pixel-mini-btn--danger {
  background: rgba(245, 63, 63, 0.18);
  border-color: rgba(245, 63, 63, 0.5);
  color: #ffb3b3;
  animation: mic-pulse 1.4s ease-in-out infinite;
}

.pixel-mini-btn .el-icon {
  font-size: 0.95rem;
}

.pixel-stage__main {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(12rem, 18rem) 1fr;
  gap: clamp(0.85rem, 1.8vw, 1.5rem);
  align-items: stretch;
  min-height: 0;
}

@media (max-width: 56rem) {
  .pixel-stage__main {
    grid-template-columns: 1fr;
  }
}

.pixel-stage__character {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1rem 0.5rem;
  background: linear-gradient(180deg, rgba(91, 141, 239, 0.1) 0%, rgba(91, 141, 239, 0.02) 100%);
  border: 1px solid rgba(91, 141, 239, 0.18);
  border-radius: 1rem;
  position: relative;
  overflow: hidden;
}

/* 角色背后柔和光晕 */
.pixel-stage__character::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 60%, rgba(91, 141, 239, 0.2) 0%, transparent 60%);
  pointer-events: none;
}

.pixel-character--stage {
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 0.5rem 1rem rgba(0, 0, 0, 0.4));
}

.pixel-stage__hint {
  position: relative;
  z-index: 1;
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  padding: 0 0.5rem;
  line-height: 1.5;
}

.pixel-stage__bubbles {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  overflow-y: auto;
  padding: 0.4rem 0.4rem 0.4rem 0.2rem;
  min-height: 0;
}

.bubble {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.7rem 0.9rem;
  border-radius: 0.8rem;
  max-width: 90%;
  font-size: clamp(0.82rem, 1vw, 0.95rem);
  line-height: 1.6;
  position: relative;
  word-break: break-word;
  box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.25);
}

.bubble--user {
  align-self: flex-end;
  background: linear-gradient(135deg, #165dff, #3a7aff);
  color: #fff;
  border-bottom-right-radius: 0.25rem;
}

.bubble--assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom-left-radius: 0.25rem;
}

.bubble--placeholder {
  align-self: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.55);
  text-align: center;
  font-style: italic;
  font-size: clamp(0.8rem, 0.95vw, 0.9rem);
  padding: 1rem 1.2rem;
}

.bubble--streaming {
  background: rgba(91, 141, 239, 0.1);
  border-color: rgba(91, 141, 239, 0.3);
  color: rgba(255, 255, 255, 0.7);
}

.bubble__label {
  font-size: clamp(0.65rem, 0.8vw, 0.72rem);
  font-weight: 600;
  letter-spacing: 0.05em;
  opacity: 0.7;
  text-transform: uppercase;
}

.bubble--user .bubble__label {
  text-align: right;
}

.bubble__content {
  white-space: pre-wrap;
}

.bubble__content :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.05rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.92em;
  font-family: monospace;
}

.bubble__content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  overflow-x: auto;
  margin: 0.4rem 0;
}

/* 气泡淡入 */
.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
  transform: translateY(0.4rem);
}

/* 像素模式下的录音提示条 */
.pixel-recording {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.6rem;
  background: rgba(245, 63, 63, 0.08);
  border: 1px solid rgba(245, 63, 63, 0.35);
  color: rgba(255, 255, 255, 0.85);
  font-size: clamp(0.78rem, 0.95vw, 0.88rem);
  overflow: hidden;
}
</style>