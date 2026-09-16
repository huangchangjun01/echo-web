"""诊断:为什么 chip 数 = 0,但 trait-slider 在。直接 dump 性格页 DOM。"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

USERNAME = Path("C:/Users/h4215/AppData/Local/Temp/e2e_user").read_text().strip()
PASSWORD = "TestPass123!"


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        ctx = await b.new_context()
        page = await ctx.new_page()
        page.on("console", lambda m: print(f"[console.{m.type}] {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: print(f"[pageerror] {e}"))
        await page.goto("http://localhost:5175/login", wait_until="networkidle", timeout=20000)
        await page.fill("input[placeholder*='账号']", USERNAME)
        await page.fill("input[type='password']", PASSWORD)
        await page.click("button:has-text('登录')")
        await asyncio.sleep(2)
        await page.goto("http://localhost:5175/admin/role-editor/51", wait_until="networkidle", timeout=20000)
        await page.locator("div[role='tab']:has-text('性格')").click()
        await page.locator("div.trait-slider").first.wait_for(timeout=15000)
        await asyncio.sleep(3)
        # 1) 看 traits-tab__presets-bar 内部
        bar_html = await page.locator(".traits-tab__presets-bar").inner_html()
        print(f"=== .traits-tab__presets-bar innerHTML (前 800 字符) ===")
        print(bar_html[:800])
        # 2) 数 el-tag
        el_tags = await page.locator(".traits-tab__presets-bar .el-tag").count()
        print(f"\nel-tag count in bar: {el_tags}")
        # 3) 数 el-tag 任何 class
        all_el_tags = await page.locator(".el-tag").count()
        print(f"all el-tag count on page: {all_el_tags}")
        # 4) 看「加载预设中」文字
        loading_text = await page.locator(".traits-tab__preset-loading").count() if await page.locator(".traits-tab__preset-loading").count() else 0
        loading_visible = await page.locator(".traits-tab__preset-loading").is_visible() if loading_text else False
        print(f"loading text count: {loading_text}, visible: {loading_visible}")
        # 5) 通过 store 反查 — 但前端 store 没暴露,只能看 traits-tab 是否包含「当前使用」
        active_strong = await page.locator(".traits-tab__active strong").text_content()
        print(f"当前使用 label: {active_strong!r}")
        await b.close()


asyncio.run(main())