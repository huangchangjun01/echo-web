<template>
  <div class="echo-layout">
    <!--
      单角色单会话产品模型下,不再有侧栏 / 会话列表 / 新建 / 删除 / 重命名.
      每个 (user, role) 对应唯一一行 chat_sessions,切换角色 = 切换唯一对话.
      历史通过滚动浏览 + 日期筛选查看(见下方 messages-area 顶部的 sentinel).
    -->
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
        <!--
          历史只读浏览工具栏 + 双向滚动加载哨兵.
          - 「历史」按钮:点开 el-popover + el-calendar,绿点标出有对话的日期;
            点击日期 → 设置 anchorDate(一次性首屏锚定) → loadInitialHistory(startDate=endDate) → scrollToTop
            之后上滑触顶 → loadOlderMessages(before) 翻更早(可跨天);
            下滑触底 → loadNewerMessages(after) 翻更新(可跨天)。
          - 顶部哨兵:IntersectionObserver 进入视口时触发 loadOlderMessages()
          - 底部哨兵:onMessagesScroll 触底检测触发 loadNewerMessages()
        -->
        <div class="messages-toolbar">
          <!--
            历史日历入口:点击按钮弹出 el-popover 包 el-calendar,
            日期格里根据 sessionDates Set 渲染绿点;点击日期进入跨天滚动模式。
          -->
          <el-popover
            v-model:visible="historyPopoverOpen"
            placement="bottom-end"
            :width="340"
            trigger="manual"
            popper-class="history-calendar-popover"
          >
            <template #reference>
              <button
                class="history-btn"
                :class="{ 'history-btn--active': historyPopoverOpen }"
                title="按日历查看历史对话"
                @click="handleHistoryClick"
              >
                <el-icon><Calendar /></el-icon>
                <span>历史</span>
              </button>
            </template>
            <div class="history-calendar">
              <el-calendar v-model="historyCalendarDate">
                <template #date-cell="{ data }">
                  <div
                    class="history-calendar__cell"
                    :class="{ 'history-calendar__cell--has': sessionDates.has(data.day) }"
                    :title="sessionDates.has(data.day) ? `${data.day} 有对话` : data.day"
                    @click.stop="handleDatePick(data.day)"
                  >
                    <span class="history-calendar__day">{{ Number(data.day.split('-')[2]) }}</span>
                    <span
                      v-if="sessionDates.has(data.day)"
                      class="history-calendar__dot"
                    />
                  </div>
                </template>
              </el-calendar>
              <div class="history-calendar__legend">
                <span class="history-calendar__dot history-calendar__dot--inline" />
                <span>表示当天有对话</span>
              </div>
              <div class="history-calendar__hint">
                点击带绿点的日期，查看当天对话（可上下滑动跨天浏览）
              </div>
            </div>
          </el-popover>
        </div>

        <!-- Messages area -->
        <div class="messages-area" ref="messagesArea" @scroll="onMessagesScroll">
          <!--
            滚动到顶部哨兵 + 「已加载全部记忆」兜底.
            三态:
              1. hasOlderHistory=true && loadingOlder=true        → 「加载中…」
              2. hasOlderHistory=true && loadingOlder=false       → 「上滑加载更早的历史」
              3. !hasOlderHistory && messages.length>0           → 「已加载全部记忆」
              4. !hasOlderHistory && messages.length===0         → 不显示(全新对话)
          -->
          <div
            v-if="historyIndicator !== 'none'"
            ref="historySentinel"
            class="history-sentinel"
            :class="`history-sentinel--${historyIndicator}`"
          >
            <span v-if="historyIndicator === 'loading'" class="history-sentinel__loading">加载中…</span>
            <span v-else-if="historyIndicator === 'hint'" class="history-sentinel__hint">上滑加载更早的历史</span>
            <span v-else-if="historyIndicator === 'exhausted'" class="history-sentinel__hint">已加载全部记忆</span>
          </div>
          <div class="messages-inner">
            <div
              v-for="msg in chatStore.currentSession?.messages ?? []"
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
              <!--
                message-bubble-col:把 bubble + 时间戳包成一个 column,
                让 bubble 始终贴在自己的对齐边(assistant 左、user 右),
                时间戳跟 bubble 同一侧对齐,不会被 actions / avatar 推跑。
              -->
              <div class="message-bubble-col" :class="`message-bubble-col--${msg.role}`">
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
                    <!--
                      普通 assistant 消息：改用 StreamingBubble 聚合组件。
                      把所有流式 / 折叠面板 / 操作栏都交给子组件处理,
                      这里只负责传入数据 (msg + isStreaming + streamingReasoning)。
                    -->
                    <StreamingBubble
                      v-else-if="msg.role === 'assistant'"
                      :message="msg"
                      :is-streaming="msg.id === chatStore.streamingMessageId"
                      :streaming-reasoning="msg.id === chatStore.streamingMessageId ? streamingReasoningText : ''"
                      class="message-streaming"
                      @feedback="onAssistantFeedback"
                    />
                    <!-- 用户消息：直接展示 -->
                    <div v-else class="message-content">
                      <span v-if="msg.content">{{ msg.content }}</span>
                    </div>
                  </template>
                </div>
                <!--
                  时间戳:bubble 下方一行小字,智能格式
                  (今天 HH:MM / 本年内 MM-DD HH:MM / 跨年 YYYY-MM-DD HH:MM)。
                  编辑态下隐藏(避免与 textarea 挤一起)。title 给完整时间。
                -->
                <div
                  v-if="!editingMessageId || msg.role !== 'user'"
                  class="message-time"
                  :class="`message-time--${msg.role}`"
                  :title="formatMessageTimeFull(msg.createdAt)"
                >{{ formatMessageTime(msg.createdAt) }}</div>
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
          </div>
          <!--
            滚动到底部哨兵 + 「已是最新对话」兜底.
            二态(底部不主动提示「下滑加载更多」,静默触发即可):
              1. newerIndicator='loading'   → 正在加载更新一页
              2. newerIndicator='exhausted' → !hasNewerHistory && 已加载非空 → 「已是最新对话」
              3. newerIndicator='none'      → 还有更多可加载 或 全新对话 → 不显示
          -->
          <div
            v-if="newerIndicator !== 'none'"
            class="history-newer-sentinel"
            :class="`history-newer-sentinel--${newerIndicator}`"
          >
            <span v-if="newerIndicator === 'loading'" class="history-newer-sentinel__loading">加载中…</span>
            <span v-else-if="newerIndicator === 'exhausted'" class="history-newer-sentinel__hint">已是最新对话</span>
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
                  <ChatMarkdown v-if="pixelDialogue" :source="pixelDialogue" />
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
                <div class="history-item__content">
                  {{ item.content }}
                </div>
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
  Close,
  UserFilled,
  Promotion,
  VideoPause,
  VideoPlay,
  CopyDocument,
  RefreshRight,
  Microphone,
  CircleClose,
  Headset,
  Mute,
  Document,
  Calendar,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore, messageItemToMessage } from '@/stores/chat'
import { useRolesStore } from '@/stores/roles'
import type { Message } from '@/types/chat'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis'
import { useChatStream } from '@/composables/useChatStream'
import { createTypewriter } from '@/composables/useTypewriter'
import PixelCharacter from '@/components/PixelCharacter.vue'
import MoodIndicator from '@/components/MoodIndicator.vue'
import PixelScene from '@/components/PixelScene.vue'
import StreamingBubble from '@/components/chat/StreamingBubble.vue'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import { detectEmotion, EMOTION_LABELS, type Emotion } from '@/utils/emotion'
import { sessionIdFor } from '@/utils/sessionId'
import { listSessionMessages, listSessionDates } from '@/api/session'

const chatStore = useChatStore()
const rolesStore = useRolesStore()

/**
 * 单会话模型下:全局只有一条流(isStreaming = true/false)。所有 UI 守卫直接
 * 读 ``chatStore.isStreaming`` 即可,不需要 per-session 区分。
 */
const inputText = ref('')
const emptyInputText = ref('')
const messagesArea = ref<HTMLElement | null>(null)
const editingMessageId = ref<string | null>(null)
const editingText = ref('')
/** 标记下一条待发送消息的来源（语音 / 文本），handleSend 消费后重置为 text */
const pendingSource = ref<'text' | 'voice'>('text')

/* ---- 历史只读浏览：双向滚动加载（before / after 游标）---- */
/** 一次性日期锚定:handleDatePick 设置后,loadInitialHistory 当次会带 startDate=endDate,
 *  加载完后立刻清空;loadOlderMessages/loadNewerMessages 不再读它(后续纯游标跨天)。
 */
const anchorDate = ref<string | null>(null)
/** 触顶哨兵 ref（IntersectionObserver 观察） */
const historySentinel = ref<HTMLElement | null>(null)
/** 当前是否还有更早的历史页可加载 */
const hasOlderHistory = ref(false)
/** 向前翻页游标 —— 传给后端 list_messages 的 nextBefore */
const historyCursor = ref<string | null>(null)
/** 加载更早历史时是否在请求中（防止重复触发） */
const loadingOlder = ref(false)
/** 当前是否还有比当前已加载更新的消息可加载 */
const hasNewerHistory = ref(false)
/** 向后翻页游标 —— 比当前已加载最新一条还新的下一页起点(nextAfter) */
const newerCursor = ref<string | null>(null)
/** 加载更新一页时是否在请求中（防止重复触发） */
const loadingNewer = ref(false)

/* ---- 历史日历视图:列出有消息的日期 + 点击跳转 ---- */
/** 弹窗是否打开(用 manual trigger 自己控制开合) */
const historyPopoverOpen = ref(false)
/** 当前会话有消息的日期集合(YYYY-MM-DD),用于日历绿点指示器 */
const sessionDates = ref<Set<string>>(new Set())
/** 日历是否正在拉取有消息的日期(避免重复请求) */
const historyCalendarLoading = ref(false)
/** el-calendar 内部用:当前展示的月份;v-model 让它能翻页 */
const historyCalendarDate = ref<Date>(new Date())

/**
 * 拉取当前会话所有有消息的日期,用于日历视图。
 * 单会话模型下 (user, role) 必唯一 —— 后端用 sessionIdFor(user, role) 兜底即可。
 * 不传 sessionId 也行,但显式传入能让后端日志更清晰。
 */
async function loadSessionDates(): Promise<void> {
  if (historyCalendarLoading.value) return
  historyCalendarLoading.value = true
  try {
    const resp = await listSessionDates({
      userId: chatStore.userId,
      sessionId: localSessionId.value,
      roleId: rolesStore.currentRoleId || 'default',
      limit: 365,
    })
    if (resp.ok) {
      sessionDates.value = new Set(resp.dates.map((d) => d.date))
      console.info('[chat] history dates loaded', JSON.stringify({ count: resp.dates.length, sample: resp.dates.slice(0, 3) }))
    } else {
      sessionDates.value = new Set()
      console.warn('[chat] history dates biz error:', resp.error)
    }
  } catch (e) {
    sessionDates.value = new Set()
    console.warn('[chat] history dates failed:', e)
  } finally {
    historyCalendarLoading.value = false
  }
}

/**
 * 「历史」按钮点击:首次打开时拉一次日期列表,后续切复直接切弹窗开合。
 */
async function handleHistoryClick(): Promise<void> {
  const next = !historyPopoverOpen.value
  historyPopoverOpen.value = next
  if (next && sessionDates.value.size === 0 && !historyCalendarLoading.value) {
    await loadSessionDates()
  }
}

/**
 * 日历点击某一天:进入跨天滚动浏览模式。
 *  - 设 anchorDate,loadInitialHistory 当次带 startDate=endDate=picked 拉当天全部;
 *  - 加载完后锚定立刻清空,后续 loadOlder/loadNewerMessages 走纯游标(可能跨天);
 *  - 滚到顶部(当天最早一条在最上),由用户自然向下滑动看更新,向上滑动看更早。
 *
 * el-calendar 在 date-cell slot 的 click 事件里传 ``YYYY-MM-DD`` 字符串,
 * 在 v-model 同步时会传 Date 对象;两种都做兼容。
 */
function handleDatePick(value: Date | string): void {
  let picked: string
  if (typeof value === 'string') {
    picked = value
  } else {
    const pad = (n: number) => n.toString().padStart(2, '0')
    picked = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  historyPopoverOpen.value = false
  // 锚定模式:首次 loadInitialHistory 带 startDate=endDate=picked,加载完后游标自然衔接
  anchorDate.value = picked
  void (async () => {
    await loadInitialHistory()
    await scrollToTop()
    console.info('[chat] history date picked', JSON.stringify({ picked }))
  })()
}

/**
 * 历史顶部哨兵的三态指示:
 *   - 'none'      没消息或不需要显示(全新会话)
 *   - 'loading'   正在加载更早一页
 *   - 'hint'      还有更早页可加载(滚动到顶)
 *   - 'exhausted' 已加载到最早一条 —— 让用户明确知道「再上滑也不会有新数据」
 */
const historyIndicator = computed<'none' | 'loading' | 'hint' | 'exhausted'>(() => {
  const session = chatStore.currentSession
  if (!session || session.messages.length === 0) return 'none'
  if (loadingOlder.value) return 'loading'
  if (hasOlderHistory.value) return 'hint'
  return 'exhausted'
})

/**
 * 历史底部哨兵指示(单边):
 *   - 'none'      还有更新可加载,或全新对话 → 不显示(静默滚动加载即可)
 *   - 'loading'   正在加载更新一页
 *   - 'exhausted' !hasNewerHistory && 已加载非空 → 「已是最新对话」
 */
const newerIndicator = computed<'none' | 'loading' | 'exhausted'>(() => {
  const session = chatStore.currentSession
  if (!session || session.messages.length === 0) return 'none'
  if (loadingNewer.value) return 'loading'
  if (!hasNewerHistory.value) return 'exhausted'
  return 'none'
})

/**
 * (user, role) → deterministic session_id(32 hex)。与后端 biz/chat_sessions.session_id_for 算法一致。
 * 用于把消息写到正确的 chat_sessions 行（按 (user, role) 唯一的那一行）。
 */
const localSessionId = computed(() =>
  sessionIdFor(chatStore.userId, rolesStore.currentRoleId || 'default'),
)

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

/* ---- 流式状态：StreamingBubble 需要的本地 ref ---- */
/** model_reasoning 阶段的实时打字机文本（DeepSeek 风格思考面板） */
const streamingReasoningText = ref('')
/** 装饰性即时回应（presence）：首字到达前在 assistant 气泡内展示，随后清空 */
const presenceText = ref('')

/** 打字机（双轨：正文 + 思考） */
let typewriter: ReturnType<typeof createTypewriter> | null = null
let reasoningTypewriter: ReturnType<typeof createTypewriter> | null = null

function startTypewriter(sink: (chunk: string) => void) {
  if (typewriter) typewriter.stop(true)
  typewriter = createTypewriter({
    charsPerTick: 1,
    tickMs: 28,
    onAppend: sink,
  })
}

function stopTypewriter(flush: boolean, sink?: (chunk: string) => void) {
  if (!typewriter) return
  typewriter.stop(flush, sink)
  typewriter = null
}

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
  reasoningTypewriter?.push(text)
}

function stopReasoningTypewriter(flush: boolean) {
  if (!reasoningTypewriter) return
  reasoningTypewriter.stop(flush)
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
  onSentence: (text) => {
    void handleSentence(text)
  },
  onError: (msg) => {
    if (msg === 'not-allowed' || msg === 'service-not-allowed') {
      ElMessage.error('麦克风权限被拒绝，请在浏览器设置中允许后重试')
    } else if (msg === 'no-speech') {
      console.info('[chat] no speech detected')
    } else if (msg === 'aborted') {
      console.info('[chat] voice input aborted by user')
      ElMessage.info('已终止本次语音')
    } else {
      ElMessage.warning(`语音识别失败: ${msg}`)
    }
  },
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
const tts = useSpeechSynthesis({
  lang: 'zh-CN',
  pitch: 1.18,
  rate: 0.96,
  onStart: () => {
    console.info('[chat] tts started, id=%s', speakingId.value ?? '')
  },
  onEnd: () => {
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
 * 语音插话打断（barge-in）
 * ====================================================================== */
const bargeInArmed = ref(false)
const userIsInterrupting = ref(false)
let ttsStartedAt = 0
const BARGE_IN_GRACE_MS = 500
const BARGE_IN_MIN_LEN = 2

function startBargeInListening() {
  if (!speech.isSupported.value) return
  if (isListening.value) return
  const wantBargeIn =
    autoPlay.value || (chatMode.value === 'pixel' && pixelAutoListen.value)
  if (!wantBargeIn) return
  bargeInArmed.value = true
  userIsInterrupting.value = false
  speech.reset()
  speech.start()
  console.info('[chat] barge-in mic armed')
}

function resetBargeInState(reason: string) {
  if (!bargeInArmed.value && !userIsInterrupting.value) return
  bargeInArmed.value = false
  userIsInterrupting.value = false
  console.info('[chat] barge-in state reset (%s)', reason)
}

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
      console.info('[chat] barge-in active, keep mic for user sentence')
      return
    }
    const keepMic =
      chatMode.value === 'pixel' && pixelAutoListen.value
    if (!keepMic && isListening.value) {
      console.info('[chat] tts ended without barge-in, stop mic')
      speech.stop()
    }
    userIsInterrupting.value = false
  }
})

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

watch(isListening, (listening, prev) => {
  if (prev && !listening && bargeInArmed.value) {
    resetBargeInState('mic stopped externally')
  }
})

watch(autoPlay, (v) => {
  try {
    localStorage.setItem(AUTO_PLAY_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (!v) {
    tts.stop()
    speakingId.value = null
    if (bargeInArmed.value && isListening.value) {
      speech.stop()
    }
    resetBargeInState('autoPlay disabled')
  }
})

function handleToggleMic() {
  if (isListening.value) {
    speech.stop()
    return
  }
  speech.reset()
  speech.start()
}

function handleAbort() {
  if (!isListening.value) return
  speech.abort()
  shouldResumeListening.value = false
  console.info('[chat] user aborted current voice input')
}

async function handleSentence(text: string) {
  if (!text) return
  if (chatStore.isStreaming) {
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

function handleToggleAutoPlay() {
  autoPlay.value = !autoPlay.value
}

function handleTogglePlay(msg: Message) {
  if (speakingId.value === msg.id) {
    tts.stop()
    speakingId.value = null
    return
  }
  tts.stop()
  speakingId.value = msg.id
  tts.speak(msg.content)
}

function resumeListeningIfNeeded() {
  if (!shouldResumeListening.value) return
  if (chatStore.isStreaming) return
  if (!speech.isSupported.value) {
    shouldResumeListening.value = false
    return
  }
  shouldResumeListening.value = false
  if (isListening.value) return
  nextTick(() => {
    speech.reset()
    speech.start()
  })
}

const quickStarts = [
  '帮我写一首关于人工智能的诗',
  '解释一下量子计算的基本原理',
  '推荐一些提高工作效率的方法',
  '用 Python 实现一个快速排序算法',
]

/** =====================================================================
 * 历史只读浏览：双向滚动加载（before / after 游标）+ 日历一次性日期锚定
 *
 * 设计要点：
 *  - 日历点击日期 → handleDatePick → anchorDate=picked → loadInitialHistory 带
 *    startDate=endDate=picked 拉当天全部 → scrollToTop；后续纯游标衔接。
 *  - 触顶加载：用 IntersectionObserver 观察顶部 sentinel，进入视口时调
 *    listSessionMessages(before=historyCursor) 拉下一页,prepend 到 messages 头部。
 *  - 触底加载：onMessagesScroll 检测 scrollTop+clientHeight >= scrollHeight 时调
 *    listSessionMessages(after=newerCursor) 拉下一页,append 到 messages 尾部。
 *  - 切角色后 (user, role) 改变 → localSessionId 改变 → 重置 messages + 重新加载。
 * ====================================================================== */

/**
 * 首次进入或切角色时:拉当前 (user, role) 的最近 N 条消息,保证 scroll-to-bottom
 * 能停在底部而不是停在 0。
 *
 * anchorDate 模式下(``handleDatePick`` 设的):带 startDate=endDate=anchorDate
 * 一次性锚定,limit 拉够大以覆盖当天全部;加载完后立刻清空 anchorDate,
 * 后续 loadOlder/loadNewerMessages 走纯游标(可跨天)。
 */
async function loadInitialHistory(): Promise<void> {
  const sid = localSessionId.value
  // 确保本地有一行 chat_sessions 占位(避免 currentSession 为空,模板渲染 fallback)
  let session = chatStore.sessions.find((s) => s.id === sid)
  if (!session) {
    chatStore.sessions.unshift({
      id: sid,
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      msgCount: 0,
      loadedCount: 0,
    })
    // 重新从 store 取回引用:unshift 进数组的是原始对象,只有通过 reactive proxy
    // 读写才会触发渲染。若直接持有原始对象写 messages,数据进内存但页面不会更新
    // (刷新后「有历史消息却显示空白」的根因)。
    session = chatStore.sessions.find((s) => s.id === sid)
    if (!session) return
  }
  // (单会话模型下,不需要再写 currentSessionId —— sessions[0] 就是当前)
  // 重置双向分页状态
  historyCursor.value = null
  hasOlderHistory.value = false
  loadingOlder.value = false
  newerCursor.value = null
  hasNewerHistory.value = false
  loadingNewer.value = false
  // 一次性锚定:handleDatePick 设置 → 当次带 startDate=endDate → 加载后立刻清空
  const anchoredDate = anchorDate.value
  const isAnchored = typeof anchoredDate === 'string' && anchoredDate.length > 0
  if (isAnchored) anchorDate.value = null
  try {
    const resp = await listSessionMessages({
      userId: chatStore.userId,
      sessionId: sid,
      // 锚定模式下多拉一些(单天消息通常 < 200),保证覆盖当天全部;
      // 上限 200 是后端 ListMessagesReq 的 Pydantic le 限制。
      // 普通进入会话仍走默认 50,避免一次返回过多拖慢首屏。
      limit: isAnchored ? 200 : 50,
      roleId: rolesStore.currentRoleId || 'default',
      startDate: isAnchored ? anchoredDate : undefined,
      endDate: isAnchored ? anchoredDate : undefined,
    })
    console.info(
      '[chat] loadInitialHistory',
      JSON.stringify({
        sid,
        chatStoreUserId: chatStore.userId,
        currentRoleId: rolesStore.currentRoleId,
        anchoredDate: isAnchored ? anchoredDate : null,
        ok: resp.ok,
        itemsCount: resp.items?.length ?? 0,
        nextBefore: resp.nextBefore,
        nextAfter: resp.nextAfter,
        error: resp.error,
      }),
    )
    if (resp.ok) {
      session.messages = resp.items.map(messageItemToMessage)
      session.loadedCount = session.messages.length
      session.msgCount = session.messages.length
      historyCursor.value = resp.nextBefore ?? null
      hasOlderHistory.value = Boolean(resp.nextBefore)
      newerCursor.value = resp.nextAfter ?? null
      hasNewerHistory.value = Boolean(resp.nextAfter)
    }
  } catch (e) {
    console.warn('[chat] loadInitialHistory failed:', e)
  }
}

/**
 * 加载更早一页:用 before 游标拉一页,prepend 到 messages 头部。
 * 用 scrollHeight 差值保持用户的滚动位置（避免跳到顶部）。
 *
 * 翻页走纯游标(不带日期过滤)——日历锚定只在 loadInitialHistory 当次生效,
 * 后续 loadOlder/loadNewer 由 before/after 游标自然衔接,可能跨天。
 */
async function loadOlderMessages(): Promise<void> {
  if (loadingOlder.value || !hasOlderHistory.value || !historyCursor.value) return
  const sid = localSessionId.value
  const session = chatStore.sessions.find((s) => s.id === sid)
  if (!session) return
  loadingOlder.value = true
  const prevScrollHeight = messagesArea.value?.scrollHeight ?? 0
  try {
    const resp = await listSessionMessages({
      userId: chatStore.userId,
      sessionId: sid,
      limit: 50,
      roleId: rolesStore.currentRoleId || 'default',
      before: historyCursor.value,
    })
    if (resp.ok) {
      const older = resp.items.map(messageItemToMessage)
      // prepend (id 顺序 ASC, 前端翻页后保留时序)
      session.messages = [...older, ...session.messages]
      session.loadedCount = session.messages.length
      historyCursor.value = resp.nextBefore ?? null
      hasOlderHistory.value = Boolean(resp.nextBefore)
      // 等 DOM 更新后,把滚动位置补回到 prepend 之前的位置
      if (messagesArea.value) {
        await nextTick()
        const delta = messagesArea.value.scrollHeight - prevScrollHeight
        if (delta > 0) messagesArea.value.scrollTop += delta
      }
    }
  } catch (e) {
    console.warn('[chat] loadOlderMessages failed:', e)
  } finally {
    loadingOlder.value = false
  }
}

/**
 * 加载更新一页:用 after 游标拉一页,append 到 messages 尾部。
 * 不需要 scrollHeight 补偿(append 不影响顶部可见位置),用户继续向下滑动浏览即可。
 */
async function loadNewerMessages(): Promise<void> {
  if (loadingNewer.value || !hasNewerHistory.value || !newerCursor.value) return
  const sid = localSessionId.value
  const session = chatStore.sessions.find((s) => s.id === sid)
  if (!session) return
  loadingNewer.value = true
  try {
    const resp = await listSessionMessages({
      userId: chatStore.userId,
      sessionId: sid,
      limit: 50,
      roleId: rolesStore.currentRoleId || 'default',
      after: newerCursor.value,
    })
    if (resp.ok) {
      const newer = resp.items.map(messageItemToMessage)
      // append(按时间正序追加到尾部,保留时序)
      session.messages = [...session.messages, ...newer]
      session.loadedCount = session.messages.length
      newerCursor.value = resp.nextAfter ?? null
      hasNewerHistory.value = Boolean(resp.nextAfter)
    }
  } catch (e) {
    console.warn('[chat] loadNewerMessages failed:', e)
  } finally {
    loadingNewer.value = false
  }
}

/**
 * 滚动检测兜底:IntersectionObserver 之外做手动触发。
 *   - 触顶(scrollTop < 40) → loadOlderMessages
 *   - 触底(scrollTop+clientHeight+100 >= scrollHeight) → loadNewerMessages
 */
function onMessagesScroll() {
  if (!messagesArea.value) return
  const el = messagesArea.value
  if (el.scrollTop < 40 && hasOlderHistory.value && !loadingOlder.value) {
    void loadOlderMessages()
    return
  }
  if (
    el.scrollTop + el.clientHeight + 100 >= el.scrollHeight &&
    hasNewerHistory.value &&
    !loadingNewer.value
  ) {
    void loadNewerMessages()
  }
}

/** IntersectionObserver:顶部 sentinel 进入视口时触发加载 */
let historyObserver: IntersectionObserver | null = null
function setupHistoryObserver() {
  if (historyObserver) {
    historyObserver.disconnect()
    historyObserver = null
  }
  const target = historySentinel.value
  if (!target || typeof IntersectionObserver === 'undefined') return
  historyObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && hasOlderHistory.value && !loadingOlder.value) {
          void loadOlderMessages()
        }
      }
    },
    { rootMargin: '120px 0px', threshold: 0 },
  )
  historyObserver.observe(target)
}

watch(historySentinel, () => {
  nextTick(() => setupHistoryObserver())
})

/**
 * 切角色时:重新加载该角色的历史。
 * 监听 rolesStore.currentRoleId 变化触发 —— 角色 = 唯一对话,角色一变 = 进入另一个对话窗口。
 */
watch(
  () => rolesStore.currentRoleId,
  async (newRoleId, oldRoleId) => {
    if (newRoleId === oldRoleId) return
    await loadInitialHistory()
    await scrollToBottom()
  },
  { immediate: false },
)

onMounted(async () => {
  // 单会话模型下,启动只需拉一次当前角色的最近消息。侧栏/list 全部下线。
  await loadInitialHistory()
  await scrollToBottom()
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

/** assistant 消息评价：把 up/down/none 转成 rating，调 store。 */
async function onAssistantFeedback(value: 'up' | 'down' | 'none') {
  const sid = localSessionId.value
  const session = chatStore.sessions.find((s) => s.id === sid)
  if (!session) return
  // 找最后一条 assistant 消息（用户操作的是当前气泡）
  const lastAssistant = [...session.messages].reverse().find((m) => m.role === 'assistant')
  if (!lastAssistant) {
    ElMessage.warning('当前没有可评价的助手回复')
    return
  }
  const rating: 1 | -1 | 0 = value === 'up' ? 1 : value === 'down' ? -1 : 0
  try {
    await chatStore.rateMessage(sid, lastAssistant.id, rating)
    if (rating === 1) ElMessage.success('已点赞')
    else if (rating === -1) ElMessage.success('已反馈')
    else ElMessage.info('已取消评价')
  } catch (e) {
    ElMessage.error(`反馈失败：${(e as Error).message}`)
  }
}

async function handleEmptySend() {
  const text = emptyInputText.value.trim()
  if (!text) return
  inputText.value = text
  emptyInputText.value = ''
  await handleSend()
}

async function handleQuickStart(text: string) {
  // 单会话模型下不需要手动创建 —— loadInitialHistory() 已经保证 currentSessionId 存在
  inputText.value = text
  await handleSend()
}

async function scrollToBottom() {
  await nextTick()
  if (messagesArea.value) {
    messagesArea.value.scrollTop = messagesArea.value.scrollHeight
  }
  // 二次补偿：图片加载 / markdown 渲染 / 面板过渡等异步布局会继续改变高度，
  // 下一帧再滚一次，保证停在真正的底部。
  requestAnimationFrame(() => {
    if (messagesArea.value) {
      messagesArea.value.scrollTop = messagesArea.value.scrollHeight
    }
  })
}

/**
 * 滚到顶部(handleDatePick 进入跨天滚动模式时用):
 * 让 anchorDate 当天最早一条消息对齐视口顶部,用户从最早一条开始浏览,
 * 之后上滑/下滑均由 onMessagesScroll 自然衔接跨天加载。
 */
async function scrollToTop() {
  await nextTick()
  if (messagesArea.value) {
    messagesArea.value.scrollTop = 0
  }
  // 二次补偿:图片/异步布局完成后再次设 0,避免初始 layout 后滚走
  requestAnimationFrame(() => {
    if (messagesArea.value) {
      messagesArea.value.scrollTop = 0
    }
  })
}

/* ---- useChatStream 封装：把 SSE 帧映射到本地状态 + store ---- */
const { start: startStream, cancel: cancelStream } = useChatStream()

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  // 单会话模型下,localSessionId 直接由 (user, role) 确定性算出(必存在)。
  // 后端 biz/chat_sessions.session_id_for 用相同算法 → chat_messages 写到对应 (user, role) 行。
  const sid = localSessionId.value
  let session = chatStore.sessions.find((s) => s.id === sid)
  if (!session) {
    // 兜底:loadInitialHistory() 没跑过(理论上不会发生,但保证发送链路不挂)
    session = {
      id: sid,
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      msgCount: 0,
      loadedCount: 0,
    }
    chatStore.sessions.unshift(session)
  }
  // (单会话模型下,不需要再写 currentSessionId —— sessions[0] 就是当前)

  if (isListening.value) {
    shouldResumeListening.value = true
    speech.stop()
  } else {
    shouldResumeListening.value = false
  }

  inputText.value = ''
  presenceText.value = ''
  const source = pendingSource.value
  pendingSource.value = 'text'
  chatStore.addMessage(sid, { role: 'user', content: text, source })
  await scrollToBottom()

  chatStore.isStreaming = true
  const assistantMsg = chatStore.addMessage(sid, { role: 'assistant', content: '' })

  const lastMsg = session.messages[session.messages.length - 1]
  lastMsg.content = ''

  chatStore.setStreamingMessageId(assistantMsg.id)

  startTypewriter((chunk) => {
    lastMsg.content += chunk
    session.updatedAt = Date.now()
    scrollToBottom()
  })
  startReasoningTypewriter((chunk) => {
    streamingReasoningText.value += chunk
  })

  // 业界 messages[] 协议：只发当前输入,多轮历史由 echo-ai 按 sessionId 从
  // chat_messages 加载(服务端状态);不再把全部历史拼成 message 撞 4096 上限。

  startStream(
    {
      model: chatStore.selectedModel,
      userId: chatStore.userId,
      sessionId: sid,
      roleId: rolesStore.currentRoleId || 'default',
      message: text,
      messages: [{ role: 'user', content: text }],
    },
    {
      onChunk: (chunk) => {
        if (presenceText.value) presenceText.value = ''
        typewriter?.push(chunk)
      },
      onPrefix: (content) => typewriter?.push(content),
      onPresence: (content) => {
        presenceText.value = content
      },
      onContext: (info) => {
        chatStore.appendMessageContext(sid, info)
      },
      onTool: (toolCall) => {
        chatStore.appendMessageToolCalls(sid, [toolCall])
      },
      onResource: async (resource) => {
        chatStore.appendMessageResource(sid, resource)
        await scrollToBottom()
      },
      onMemory: (result) => {
        chatStore.appendMessageMemoryResult(sid, result)
        if (result.ok) ElMessage.success('已提取长期记忆')
        else ElMessage.warning(`长期记忆提取失败${result.error ? `：${result.error}` : ''}`)
      },
      onThinking: (ev) => {
        chatStore.appendMessageThinking(sid, ev)
        if (ev.stage === 'model_reasoning') {
          pushReasoning(ev.text)
        }
        scrollToBottom()
      },
      onRecall: (info) => {
        chatStore.appendMessageMemoryRecall(sid, info)
        scrollToBottom()
      },
      onMoodUpdate: (m) => {
        chatStore.updateMood(m)
        scrollToBottom()
      },
      onDone: () => {
        stopTypewriter(true, (rest) => {
          lastMsg.content += rest
        })
        stopReasoningTypewriter(true)
        presenceText.value = ''
        chatStore.setStreamingMessageId(null)
        chatStore.isStreaming = false
        // 输出完成：冲刷剩余内容 + 操作栏/面板收起会改变高度，必须再滚一次到底部
        scrollToBottom()
        // 单会话模型下没有 listExhausted / refreshCurrentSessionInList 这类副作用要清理
        const shouldSpeak =
          (autoPlay.value || (chatMode.value === 'pixel' && pixelAutoListen.value)) &&
          lastMsg &&
          lastMsg.content.trim()
        if (shouldSpeak) {
          speakingId.value = lastMsg.id
          console.info('[chat] SSE done, playing new TTS for msg=%s', lastMsg.id)
          tts.speak(lastMsg.content)
        } else {
          resumeListeningIfNeeded()
        }
      },
      onError: (error) => {
        stopTypewriter(true, (rest) => {
          lastMsg.content += rest
        })
        stopReasoningTypewriter(true)
        chatStore.setStreamingMessageId(null)
        chatStore.isStreaming = false
        ElMessage.error(`请求失败: ${error.message}`)
        scrollToBottom()
        resumeListeningIfNeeded()
      },
    },
  )
}

function handleStop() {
  cancelStream()
  const session = chatStore.currentSession
  const lastMsg = session?.messages[session.messages.length - 1]
  stopTypewriter(true, lastMsg ? (rest) => (lastMsg.content += rest) : undefined)
  stopReasoningTypewriter(true)
  chatStore.setStreamingMessageId(null)
  chatStore.isStreaming = false
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
  if (chatStore.isStreaming) return

  const session = chatStore.sessions.find((s) => s.id === localSessionId.value)
  if (!session) return

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

  const session = chatStore.sessions.find((s) => s.id === localSessionId.value)
  if (!session) return

  const msgIndex = session.messages.findIndex((m) => m.id === msgId)
  if (msgIndex === -1) return

  const original = session.messages[msgIndex]
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

// 流式结束（成功/失败/手动停止）后，等 DOM 渲染稳定再滚一次到底部，
// 覆盖操作栏出现、面板收起、图片加载等「完成时」的异步高度变化。
watch(
  () => chatStore.isStreaming,
  (streaming) => {
    if (!streaming) scrollToBottom()
  },
)

/* ========================================================================
 * 像素人物模式（额外逻辑）
 * ====================================================================== */

/** 像素模式是否处于"自动开启录音"的状态 */
const pixelAutoListen = ref(false)
/** 历史对话抽屉是否打开 */
const historyOpen = ref(false)
type SubtitleSpeaker = 'user' | 'echo' | 'placeholder'
const activeSubtitle = ref<SubtitleSpeaker>('placeholder')

/** 角色尺寸：根据视口高度自适应 */
const characterSize = computed(() => {
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return Math.max(180, Math.min(360, Math.round(h * 0.5)))
})

/** 格式化时间戳 HH:MM */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 消息气泡下方时间戳的智能格式:
 *   - 今天       → HH:MM
 *   - 本年内     → MM-DD HH:MM
 *   - 跨年/更早  → YYYY-MM-DD HH:MM
 * 无效时间戳(0 / NaN)返回空串,模板里就能直接靠 v-if 控制隐藏。
 */
function formatMessageTime(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return hm
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (d.getFullYear() === now.getFullYear()) return `${md} ${hm}`
  return `${d.getFullYear()}-${md} ${hm}`
}

/** hover 提示用的完整时间(YYYY-MM-DD HH:MM),与 formatMessageTime 同源 */
function formatMessageTimeFull(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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

function toggleHistory() {
  historyOpen.value = !historyOpen.value
  console.info('[chat] history drawer -> %s', historyOpen.value ? 'open' : 'closed')
}

function decideSubtitle(): SubtitleSpeaker {
  if (chatStore.isStreaming || isPixelTalking.value) return 'echo'
  if (isListening.value || displayInterim.value) return 'user'
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

// (handleSwitchMode 已删除 —— 模板里没有按钮引用它)

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

function stopPixelAutoListen() {
  pixelAutoListen.value = false
  if (isListening.value) speech.stop()
  if (pixelState.value === 'listen' || pixelState.value === 'idle') {
    pixelState.value = 'idle'
  }
  console.info('[pixel] auto voice listening stopped')
}

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

watch(tts.isSpeaking, (v) => {
  if (chatMode.value !== 'pixel') return
  isPixelTalking.value = v
  if (v) {
    if (pixelState.value !== 'happy' && pixelState.value !== 'excited' && pixelState.value !== 'sad') {
      pixelState.value = 'talk'
    }
  } else {
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

watch(isListening, (v) => {
  if (chatMode.value !== 'pixel') return
  if (v) {
    if (pixelState.value !== 'happy' && pixelState.value !== 'excited' && pixelState.value !== 'sad' && pixelState.value !== 'talk') {
      pixelState.value = 'listen'
    }
  } else {
    if (pixelState.value === 'listen') pixelState.value = 'idle'
  }
})

watch(
  () => chatStore.isStreaming,
  (v) => {
    if (chatMode.value !== 'pixel') return
    if (v) {
      if (!tts.isSpeaking.value) pixelState.value = 'thinking'
    }
  },
)

watch(
  chatMode,
  (v) => {
    if (v === 'pixel') {
      nextTick(() => {
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
  if (historyObserver) {
    historyObserver.disconnect()
    historyObserver = null
  }
})

watch(
  () => tts.isSpeaking.value,
  (v) => {
    if (!v) return
    const s = chatStore.currentSession
    if (!s) return
    const last = s.messages[s.messages.length - 1]
    if (last && last.role === 'assistant' && last.content.trim()) {
      applyEmotionToPixel(last.content)
    }
  },
)

watch(
  () => {
    const s = chatStore.currentSession
    if (!s) return null
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

/* 关键字筛选输入框 */
.session-filter {
  padding: 0.35rem 0.5rem 0.5rem;
}
.session-filter :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  border-radius: 0.5rem;
}
.session-filter :deep(.el-input__inner) {
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.78rem;
}
.session-filter :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.3);
}
.session-filter :deep(.el-input__prefix-inner) {
  color: rgba(255, 255, 255, 0.4);
}

/* 触底哨兵 */
.session-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 0;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
}
.session-sentinel__loading::before {
  content: '';
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  border-top-color: rgba(91, 141, 239, 0.85);
  margin-right: 0.4rem;
  animation: spin 0.9s linear infinite;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 重命名按钮：hover 才显示，与删除按钮同组 */
.session-edit {
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
  font-size: 0.7rem;
  opacity: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}
.session-item:hover .session-edit {
  opacity: 1;
}
.session-edit:hover {
  background: rgba(91, 141, 239, 0.2);
  color: #5b8def;
}

/* 重命名弹层 */
.session-rename-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.session-rename-dialog {
  width: 80%;
  max-width: 18rem;
  background: #1f1f29;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.6rem;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.4);
}
.session-rename-dialog__title {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}
.session-rename-dialog__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
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

.session-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.15rem;
}

.session-title {
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.session-item--active .session-title {
  color: #fff;
}

/* lastMsgAt 相对时间：紧贴标题下方，灰色小字 */
.session-time {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-item--active .session-time {
  color: rgba(255, 255, 255, 0.65);
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

/* ====== 历史浏览工具栏：仅留「历史」按钮入口(筛选 UI 已下线) ====== */
.messages-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: clamp(0.5rem, 1vw, 0.75rem) clamp(0.85rem, 1.8vw, 1.5rem);
  background: rgba(255, 255, 255, 0.025);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

/* 历史日历按钮(暗色辅助操作,左对齐 messages-toolbar 即可) */
.history-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  height: 1.85rem;
  padding: 0 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  white-space: nowrap;
}
.history-btn .el-icon {
  font-size: 0.92rem;
}
.history-btn:hover:not(.history-btn--active) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(91, 141, 239, 0.4);
  color: #fff;
}
.history-btn--active {
  background: rgba(22, 93, 255, 0.18);
  border-color: rgba(22, 93, 255, 0.55);
  color: #fff;
  box-shadow: 0 0.2rem 0.55rem rgba(22, 93, 255, 0.18);
}

/* 历史日历弹窗 —— 沿用暗色主题,贴合 messages-toolbar 配色 */
.history-calendar {
  padding: 0.25rem;
}
/* popover 容器深色覆写(直接挂在 popper 上,需要 !important 压过 el 默认主题) */
:global(.history-calendar-popover) {
  background: #2a2a2a !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.45) !important;
  color: #fff;
}
.history-calendar :deep(.el-calendar) {
  --el-calendar-cell-width: 36px;
  --el-calendar-header-padding: 0.3rem 0.4rem;
}
.history-calendar :deep(.el-calendar__header) {
  color: rgba(255, 255, 255, 0.85);
  padding: 0.25rem 0.4rem;
}
.history-calendar :deep(.el-calendar__title) {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85rem;
}
.history-calendar :deep(.el-calendar__button-group .el-button) {
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.72rem;
  padding: 2px 8px;
}
.history-calendar :deep(.el-calendar__button-group .el-button.is-active),
.history-calendar :deep(.el-calendar__button-group .el-button:hover) {
  color: #fff;
  background: rgba(22, 93, 255, 0.22);
  border-color: rgba(22, 93, 255, 0.5);
}
.history-calendar :deep(.el-calendar__arrow-btn),
.history-calendar :deep(.el-calendar__arrow-btn:hover) {
  color: rgba(255, 255, 255, 0.7);
}
.history-calendar :deep(.el-calendar-table) {
  color: rgba(255, 255, 255, 0.7);
}
.history-calendar :deep(.el-calendar-day) {
  padding: 0;
  height: 36px;
}
.history-calendar :deep(.el-calendar-day:hover) {
  background: rgba(255, 255, 255, 0.05);
}
.history-calendar :deep(.el-calendar-day.is-selected),
.history-calendar :deep(.el-calendar-day.is-today) {
  background: rgba(22, 93, 255, 0.18);
  color: #fff;
}
.history-calendar__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 100%;
  cursor: pointer;
  box-sizing: border-box;
  padding: 2px 0;
}
.history-calendar__cell--has {
  cursor: pointer;
}
.history-calendar__day {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.75);
}
.history-calendar__cell--has .history-calendar__day {
  color: rgba(255, 255, 255, 0.95);
  font-weight: 600;
}
.history-calendar__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #00b96b;
  box-shadow: 0 0 4px rgba(0, 185, 107, 0.55);
}
.history-calendar__dot--inline {
  display: inline-block;
  vertical-align: middle;
  margin-right: 4px;
}
.history-calendar__legend,
.history-calendar__hint {
  margin-top: 0.5rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.history-calendar__hint {
  margin-top: 0.25rem;
  color: rgba(255, 255, 255, 0.4);
}

/* 滚动触顶哨兵 */
.history-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.02em;
  user-select: none;
  /* 在消息列表最顶部留出空间,避免「上滑加载」文字挤压首条消息 */
  min-height: 2.1rem;
}
.history-sentinel--exhausted {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}
.history-sentinel__loading::before {
  content: '';
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  border-top-color: rgba(91, 141, 239, 0.85);
  margin-right: 0.4rem;
  animation: spin 0.9s linear infinite;
  vertical-align: middle;
}
.history-sentinel__hint {
  cursor: default;
}
.history-sentinel--hint .history-sentinel__hint:hover {
  color: rgba(255, 255, 255, 0.6);
}

/* 滚动触底哨兵(双向滚动模式用) —— 风格对齐 .history-sentinel */
.history-newer-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.02em;
  user-select: none;
  min-height: 2.1rem;
}
.history-newer-sentinel--exhausted {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}
.history-newer-sentinel__loading::before {
  content: '';
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  border-top-color: rgba(91, 141, 239, 0.85);
  margin-right: 0.4rem;
  animation: spin 0.9s linear infinite;
  vertical-align: middle;
}

.messages-inner {
  /* 不限制宽度,跟着 .messages-area (.chat-main flex:1) 撑满。
   * 历史对话的胶囊宽度 = chat 对话框的可视宽度,跟着变。 */
  width: 100%;
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
  max-width: 90%;
  padding: clamp(0.6rem, 1.1vw, 0.9rem) clamp(0.85rem, 1.3vw, 1.15rem);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  font-size: clamp(0.8rem, 1.05vw, 0.95rem);
  line-height: 1.7;
}

/* 用户气泡:按内容收缩 —— 短消息气泡贴合内容宽度,
 * 不提前折行、不留出一大片蓝底空白;长消息由 max-width: 90% 兜底后按容器宽度换行。 */
.message-bubble--user {
  width: fit-content;
  background: #165dff;
  color: #fff;
  border-bottom-right-radius: 0.25rem;
}

/*
 * AI 气泡:撑满可用宽度 —— 让长内容按容器宽度整体换行(段落式)。
 * 千万不要用 width: fit-content:LLM 输出里句间的 \n 会被 ChatMarkdown
 * 渲染成 <br>,fit-content 会把气泡缩到「最长一行」的宽度,视觉上变成
 * 「又窄又细、每句一行」,而不是正常的段落式回答。
 */
.message-bubble--assistant {
  width: 100%;
  max-width: 100%;
  background: #2a2a2a;
  color: rgba(255, 255, 255, 0.9);
  border-bottom-left-radius: 0.25rem;
}

/*
 * 用户消息气泡的文本渲染规则 —— 与输入框 <el-textarea> 保持一致:
 *  - white-space: pre-wrap  → 保留用户主动按下的 \n(多行输入),不折叠为单行
 *  - overflow-wrap: break-word → 仅当一段内容超过 max-width 时才在字间断行,避免溢出
 * 保证输入框、用户气泡、AI 回复气泡三者的换行逻辑统一为"按段落换行 + 自然宽度换行"。
 */
.message-content {
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

/*
 * bubble-col 把 bubble + 时间戳纵向堆叠,并控制横向对齐:
 *   - assistant: 左对齐(bubble 贴左、时间戳也贴左)
 *   - user:      右对齐(bubble 贴右、时间戳也贴右)
 * flex: 1 必须保留 —— 让 col 拿到确定宽度。否则作为「宽度不确定的 column flex 子项」,
 * 气泡的 width 会解析错误:短消息被提前折行、右侧留白,AI 气泡被缩到最长一行宽(又窄又细)。
 * max-width 90% 留 10% 给对侧留白避免气泡贴满全行。
 */
.message-bubble-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  align-items: flex-start;
  max-width: 90%;
  min-width: 0;
}

.message-bubble-col--user {
  align-items: flex-end;
}

/* 消息时间戳:bubble 下方一行小字,默认低对比度避免抢戏,hover 行时略亮 */
.message-time {
  margin-top: 0.28rem;
  font-size: clamp(0.65rem, 0.85vw, 0.75rem);
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.38);
  padding: 0 clamp(0.4rem, 0.7vw, 0.55rem);
  white-space: nowrap;
  user-select: none;
  letter-spacing: 0.01em;
}

.message-wrapper:hover .message-time {
  color: rgba(255, 255, 255, 0.55);
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

/* Streaming bubble wrapper (assistant message) — minimal override.
   实际样式由 StreamingBubble 子组件自带样式处理，这里只保留左右对齐与外边距。 */
.message-streaming {
  display: block;
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

/* 方案A：装饰性即时回应（presence）——柔和、斜体 */
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

/* 打字机光标 */
.typing-caret {
  display: inline-block;
  margin-left: 1px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  animation: typing-caret-blink 1s steps(2, start) infinite;
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
  /* 同 .messages-inner:跟着 .input-area 撑满,不在 55rem 处卡住。 */
  width: 100%;
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
  width: 100%;
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
</style>
