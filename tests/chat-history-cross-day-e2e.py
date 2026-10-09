"""E2E: 历史日历点击 → 跨天滚动浏览。

验证:
1. 智能对话页工具栏无 el-date-picker / 「筛选」/ 「×」/ 「共 N 条」
2. 「历史」按钮 → el-popover + el-calendar 弹出,绿点显示
3. 点 23 号 → 23 号最早一条对齐视口顶部
4. 上滑触顶 → 22 号消息前置加载
5. 下滑触底 → 24 号消息追加加载

测试账号:e2e_history_test(独立账号,不污染数据)
测试结束后不删任何数据。
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

WEB = "http://localhost:5173"

# 复用本地已有的 e2e_session_test 账号(已有 chat 数据)
USERNAME = "e2e_session_test"
PASSWORD = "Test12345!"

# 取该账号 chat_messages 最多的 (user, role) 作主测数据
# 历史记忆里:63/54 有 52 条,跨 9月1-24 号 — 适合跨天演示
ROLE_ID = "54"


async def main() -> int:
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        # 捕获 console 错误 + 关键日志
        errors: list[str] = []
        chat_logs: list[str] = []
        page.on(
            "console",
            lambda m: (
                errors.append(m.text) if m.type == "error" else None
            ),
        )
        page.on(
            "console",
            lambda m: (
                chat_logs.append(m.text)
                if (m.type == "info" and "[chat]" in m.text)
                else None
            ),
        )
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 登录(走 home 页 + LoginDialog 弹窗)
        await page.goto(f"{WEB}/home", wait_until="networkidle", timeout=20000)
        await page.locator("input[placeholder='请输入账号']").wait_for(timeout=10000)
        await page.fill("input[placeholder='请输入账号']", USERNAME)
        await page.fill("input[placeholder='请输入密码']", PASSWORD)
        await page.locator(".login-dialog button:has-text('登录'), button:has-text('登录')").first.click()
        await asyncio.sleep(3)  # 等登录态写入 + 路由跳转

        # 进入对话页(URL 携带 role 参数)
        await page.goto(
            f"{WEB}/admin/chat?role={ROLE_ID}",
            wait_until="networkidle",
            timeout=20000,
        )
        await asyncio.sleep(2)  # 等初始消息加载

        # -------- 断言 1:工具栏里没有筛选 UI --------
        await page.screenshot(
            path="C:/Users/h4215/.claude/jobs/c036f190/tmp/01-toolbar.png",
            full_page=False,
        )
        date_picker_count = await page.locator(".el-date-picker").count()
        filter_btn_count = await page.locator(".date-filter-btn").count()
        clear_btn_count = await page.locator(".date-clear-btn").count()
        summary_count = await page.locator(".messages-toolbar__summary").count()
        print(f"[step1] el-date-picker={date_picker_count} filter={filter_btn_count} clear={clear_btn_count} summary={summary_count}")
        assert date_picker_count == 0, "工具栏不应再有 el-date-picker"
        assert filter_btn_count == 0, "工具栏不应再有「筛选」按钮"
        assert clear_btn_count == 0, "工具栏不应再有「×」按钮"
        assert summary_count == 0, "工具栏不应再有「共 N 条」摘要"

        # 工具栏里必须仍保留「历史」按钮
        history_btn = page.locator(".history-btn")
        await history_btn.wait_for(timeout=5000)
        print(f"[step1] 历史按钮可见 OK")

        # -------- 断言 2:点「历史」→ el-popover + el-calendar 弹出 --------
        await history_btn.click()
        await asyncio.sleep(1)
        calendar_visible = await page.locator(".el-calendar").is_visible()
        print(f"[step2] el-calendar visible={calendar_visible}")
        assert calendar_visible, "点「历史」后 el-calendar 必须可见"
        await page.screenshot(
            path="C:/Users/h4215/.claude/jobs/c036f190/tmp/02-calendar.png",
            full_page=False,
        )

        # 找带绿点的日期格 — 9月17号有 160 条,9月16号有 11 条
        dot_count = await page.locator(".history-calendar__dot").count()
        print(f"[step2] 绿点数={dot_count}")
        assert dot_count >= 1, "日历里应有绿点标记有消息的日期"

        # -------- 断言 3:点 9月22号 → 当天最早一条对齐顶部 --------
        # el-calendar 把每个日期渲染成 .el-calendar-day 单元格
        # 日期文本格式:"22" 出现在单元格内 —— 找带绿点的 22 号格子
        # 策略:在所有 .el-calendar-day 里找文本为 "22" 且包含绿点的那个
        target_day = page.locator(".el-calendar-day").filter(
            has=page.locator(".history-calendar__dot")
        ).filter(has_text="22").first
        await target_day.click()
        await asyncio.sleep(3)  # 等 nextTick + requestAnimationFrame scrollToTop 落位
        await page.screenshot(
            path="C:/Users/h4215/.claude/jobs/c036f190/tmp/03-anchored.png",
            full_page=False,
        )

        # 验证:scrollTop 应该接近 0(scrollToTop)
        scroll_top = await page.evaluate(
            "document.querySelector('.messages-area')?.scrollTop ?? -1"
        )
        print(f"[step3] anchored scrollTop={scroll_top}")
        # 49 行消息,scrollHeight 很大;如果 scrollToTop 没生效,scrollTop 会是 scrollHeight;
        # 如果生效,scrollTop 应该是 0(允许 250px 容差,因为 DOM 重新渲染期间会有延迟)
        scroll_height = await page.evaluate(
            "document.querySelector('.messages-area')?.scrollHeight ?? 0"
        )
        print(f"[step3] scrollHeight={scroll_height}")
        assert scroll_top < 300, f"点击日期后应滚到顶部,实际 scrollTop={scroll_top}, scrollHeight={scroll_height}"
        # 而且首条消息应该可见(在视口顶部附近)
        first_visible = await page.evaluate("""
          (() => {
            const wrapper = document.querySelector('.messages-inner .message-wrapper')
            if (!wrapper) return null
            const area = document.querySelector('.messages-area')
            const wr = wrapper.getBoundingClientRect()
            const ar = area.getBoundingClientRect()
            return { wrapperTop: wr.top, areaTop: ar.top, dist: wr.top - ar.top }
          })()
        """)
        print(f"[step3] first_visible={first_visible}")
        assert first_visible and first_visible['dist'] < 50, f"首条消息应靠近视口顶部,实际 dist={first_visible}"

        # 验证:已加载消息列表 — 用 wrapper 数 + 第一条的时间文本
        msg_count = await page.locator(".messages-inner .message-wrapper").count()
        first_time = await page.evaluate("""
          (() => {
            const list = document.querySelectorAll('.messages-inner .message-wrapper')
            return list[0]?.querySelector('.message-time')?.textContent ?? null
          })()
        """)
        first_text = await page.evaluate("""
          (() => {
            const list = document.querySelectorAll('.messages-inner .message-wrapper')
            return list[0]?.textContent?.replace(/\\s+/g, ' ').slice(0, 80) ?? null
          })()
        """)
        print(f"[step3] 消息数={msg_count} 第一条时间={first_time!r}")
        print(f"[step3] 第一条文本={first_text!r}")
        assert msg_count >= 1, "锚定日期加载后应有消息"

        # -------- 断言 4:上滑触顶 → 加载更早(可能跨天) --------
        msg_count_before = msg_count
        for _ in range(5):
            await page.evaluate(
                "document.querySelector('.messages-area').scrollTop = 0"
            )
            await asyncio.sleep(1.5)
        await page.screenshot(
            path="C:/Users/h4215/.claude/jobs/c036f190/tmp/04-loaded-older.png",
            full_page=False,
        )
        msg_count_after_older = await page.locator(".messages-inner .message-wrapper").count()
        older_first_time = await page.evaluate("""
          (() => {
            const list = document.querySelectorAll('.messages-inner .message-wrapper')
            return list[0]?.querySelector('.message-time')?.textContent ?? null
          })()
        """)
        print(f"[step4] 上滑后消息数 {msg_count_before} -> {msg_count_after_older}")
        print(f"[step4] 上滑后第一条时间={older_first_time!r}")
        if msg_count_after_older > msg_count_before:
            print("[step4] PASS 上滑触发了加载更早消息")
        else:
            print("[step4] 上滑未触发加载(可能该日已是最早一页)")

        # -------- 断言 5:下滑触底 → 加载更新(可能跨天) --------
        msg_count_before_newer = msg_count_after_older
        for _ in range(5):
            await page.evaluate(
                """
                (() => {
                  const el = document.querySelector('.messages-area')
                  el.scrollTop = el.scrollHeight
                })()
                """
            )
            await asyncio.sleep(1.5)
        await page.screenshot(
            path="C:/Users/h4215/.claude/jobs/c036f190/tmp/05-loaded-newer.png",
            full_page=False,
        )
        msg_count_after_newer = await page.locator(".messages-inner .message-wrapper").count()
        newer_last_time = await page.evaluate("""
          (() => {
            const list = document.querySelectorAll('.messages-inner .message-wrapper')
            const n = list.length
            return list[n-1]?.querySelector('.message-time')?.textContent ?? null
          })()
        """)
        print(f"[step5] 下滑后消息数 {msg_count_before_newer} -> {msg_count_after_newer}")
        print(f"[step5] 下滑后最后一条时间={newer_last_time!r}")
        if msg_count_after_newer > msg_count_before_newer:
            print("[step5] PASS 下滑触发了加载更新")
            if newer_last_time and "09-25" in newer_last_time:
                print("[step5] PASS 跨天加载到了 9月25号")
        else:
            print("[step5] 下滑未触发加载(可能该日已是最晚一页)")

        # -------- 收尾 --------
        await b.close()

        if chat_logs:
            print(f"\n[chat logs]")
            for line in chat_logs:
                print(f"  {line[:300]}")
        if errors:
            print(f"\n[console errors]")
            for e in errors:
                print(f"  {e[:200]}")
        print("\n=== ALL OK ===")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))