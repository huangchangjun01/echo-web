// ChatMarkdown 并段渲染回归测试（vitest + jsdom 真实挂载组件）
//
// 背景：闲聊型人格的模型习惯「一句一行 + 句间空行」（内容里是 \n\n），
// 视觉上又窄又高、每句一行。ChatMarkdown 渲染时要把相邻短句块折回同一段落，
// 同时必须保证：
//   1. 短句 + 短句（句间空行）→ 同一段落（不再有 <br><br> 空行）
//   2. 长段落之间的空行保留（不误并段）
//   3. 标题 / 列表 / 表格等结构块不参与并段
//   4. ``` 代码块整体原样保留（内部空行/换行不被折叠或合并）
//
// 跑：`npx vitest run test/chat-markdown-merge.test.mjs`

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ChatMarkdown from '../src/components/chat/ChatMarkdown.vue'

/** 挂载组件，等 rAF 节流回调 + DOM 更新后取渲染结果 */
async function renderHtml(source) {
  const wrapper = mount(ChatMarkdown, { props: { source } })
  await new Promise((r) => requestAnimationFrame(() => r()))
  await nextTick()
  const html = wrapper.html()
  wrapper.unmount()
  return html
}

describe('ChatMarkdown 并段渲染', () => {
  it('相邻短句（句间空行）折回同一段落，不再一句一行', async () => {
    const html = await renderHtml(
      '欸欸欸你又重复发了一次欸！\n\n是不是太兴奋啦～😆\n\n话说你到底要去哪呀～',
    )
    expect(html).not.toContain('<br><br>')
    expect(html).toContain(
      '欸欸欸你又重复发了一次欸！ 是不是太兴奋啦～😆 话说你到底要去哪呀～',
    )
  })

  it('长段落之间的空行保留（不误并段）', async () => {
    const longA = '第一段是很长的正文内容需要超过并段阈值所以写长一点再长一点。'.repeat(3)
    const longB = '第二段同样是很长的正文内容需要超过并段阈值所以写长一点再长一点。'.repeat(3)
    const html = await renderHtml(`${longA}\n\n${longB}`)
    expect(html).toContain('<br><br>')
  })

  it('列表 / 标题等结构块不与相邻短句合并', async () => {
    const html = await renderHtml(
      '给你几个小建议：\n\n- 防晒霜记得涂厚一点\n- 戴个遮阳帽\n\n## 小标题',
    )
    // 短句引导语与列表之间、列表与标题之间都保持空行
    expect(html).toContain('<br><br>')
    expect(html).toContain('- 防晒霜记得涂厚一点')
  })

  it('代码块原样保留：内部空行与换行不参与并段', async () => {
    const html = await renderHtml(
      '看这段代码：\n\n```python\nimport psutil\n\nprint(mem_mb())\n```\n\n注意缩进。',
    )
    expect(html).toContain('<pre><code>')
    expect(html).toContain('import psutil<br><br>print(mem_mb())')
  })

  it('真实线上数据：小暖人格「每句一个空行」的回复渲染成一整段', async () => {
    // 取自 chat_messages 的真实内容（\n\n 分隔每个短句）
    const real =
      '哇哇哇骑电动车出去兜风！！\n\n听起来好惬意欸～🌞\n\n但是但是！太阳很大欸！\n\n' +
      '记得要做好防晒哦！\n\n帽子戴起来～\n\n防晒乳涂起来～\n\n不然会变黑的啦！😆\n\n' +
      '话说你要去哪呀～\n\n出去玩要开开心心的哦✨'
    const html = await renderHtml(real)
    expect(html).not.toContain('<br><br>')
    expect(html).toContain(
      '哇哇哇骑电动车出去兜风！！ 听起来好惬意欸～🌞 但是但是！太阳很大欸！',
    )
  })
})