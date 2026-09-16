"""
回归测试:验证「拖动预设 dialog 内 OCEAN 滑块到 slider 允许但旧 DTO 拒绝的
范围(如 ±1.5)也能成功保存」。

历史 bug:
  - 前端 TraitSlider 范围 [-2, 2]
  - 后端 CreatePresetRequest binding "min=-1,max=1"
  - 用户拖动 slider 到 (-2, -1) 或 (1, 2) 时,后端 400 拒绝,前端提示
    "参数错误: ... failed on the 'min' tag"
修复:
  - CreatePresetRequest / UpdatePresetRequest 范围放宽到 [-2, 2],
    与 SaveTraitsRequest / TraitSlider 对齐。
本测试断言:
  1. 把 5 个 slider 全部拖到 -1.5(原会被 min=-1 拒),保存应成功
  2. 把 5 个 slider 全部拖到 +1.8(原会被 max=1 拒),保存应成功
  3. 清理:删除本次新增的预设
"""
import asyncio
import sys
import time
from pathlib import Path
from playwright.async_api import async_playwright

VITE = "http://localhost:5175"
ROLE_A = 51

USERNAME_FILE = Path("C:/Users/h4215/AppData/Local/Temp/e2e_user")
PASSWORD = "TestPass123!"

TS = int(time.time() * 1000)
PRESET_KEY_NEG = f"e2e_outofrange_neg_{TS}"
PRESET_KEY_POS = f"e2e_outofrange_pos_{TS}"


async def click_personality_tab(page) -> None:
    active = page.locator("div[role='tab'][aria-selected='true'], div[role='tab'].is-active")
    try:
        active_text = (await active.first.text_content() or "").strip()
    except Exception:
        active_text = ""
    if "性格" not in active_text:
        await page.locator("div[role='tab']:has-text('性格')").click()
    await page.locator("div.trait-slider").first.wait_for(timeout=15000)
    await asyncio.sleep(1.5)


async def drag_dialog_slider(page, value: float) -> None:
    """
    把 dialog 内 5 个 slider(在 .traits-tab__form-grid 内)全部拖到 value。
    通过 JS 设置 input.value + 派发 input 事件绕过原生拖动。
    """
    sliders = page.locator(".traits-tab__form-grid input.trait-slider__input")
    n = await sliders.count()
    assert n == 5, f"dialog should have 5 OCEAN sliders, got {n}"
    for i in range(n):
        await sliders.nth(i).evaluate(
            """(el, v) => {
                el.value = String(v)
                el.dispatchEvent(new Event('input', { bubbles: true }))
            }""",
            value,
        )
    await asyncio.sleep(0.3)


async def create_preset(page, key: str, label: str, slider_value: float) -> bool:
    await page.locator("button:has-text('新增预设')").click()
    await page.locator(".el-dialog").wait_for(timeout=3000)
    await asyncio.sleep(0.5)
    await page.locator(".el-dialog input").first.fill(key)
    await page.locator(".el-dialog .el-form-item:has-text('显示名') input").first.fill(label)
    await drag_dialog_slider(page, slider_value)
    await page.locator(".el-dialog button:has-text('创建')").click()
    # 等待 dialog 关闭(成功)或 1.5s 后报错提示(失败)
    try:
        await page.locator(".el-dialog").wait_for(state="detached", timeout=2500)
        return True
    except Exception:
        return False


async def delete_preset_by_label(page, label_substr: str) -> bool:
    chips = page.locator(".el-tag.traits-tab__preset-chip")
    n = await chips.count()
    for i in range(n):
        chip = chips.nth(i)
        text = (await chip.text_content() or "").strip()
        if label_substr not in text:
            continue
        await chip.hover()
        await asyncio.sleep(0.3)
        try:
            await chip.locator(".traits-tab__preset-x").click(timeout=2000)
        except Exception:
            await chip.locator("[title*='删除']").first.click()
        try:
            await page.locator(".el-message-box button:has-text('删除')").click(timeout=2000)
        except Exception:
            await page.locator(".el-message-box .el-button--primary").click()
        await asyncio.sleep(1.5)
        return True
    return False


async def main() -> int:
    if not USERNAME_FILE.exists():
        print(f"FAIL: username file missing at {USERNAME_FILE}")
        return 1
    username = USERNAME_FILE.read_text().strip()
    print(f"=== Login as {username} (role {ROLE_A}) — slider out-of-range preset save ===")

    errors: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()
        page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

        await page.goto(f"{VITE}/login", wait_until="networkidle", timeout=20000)
        await page.fill("input[placeholder*='账号']", username)
        await page.fill("input[type='password']", PASSWORD)
        await page.click("button:has-text('登录')")
        await asyncio.sleep(2)

        await page.goto(f"{VITE}/admin/role-editor/{ROLE_A}", wait_until="networkidle", timeout=20000)
        await click_personality_tab(page)

        # === Case 1: 拖到 -1.5(原 min=-1 拒)===
        print(f"\n=== Case 1: all 5 sliders → -1.5 (was rejected by min=-1) ===")
        ok_neg = await create_preset(page, PRESET_KEY_NEG, f"E2E-NEG-{TS}", -1.5)
        print(f"  Create with -1.5: ok={ok_neg}")
        assert ok_neg, "FAIL: preset with OCEAN=-1.5 was rejected (DTO min still -1?)"

        await click_personality_tab(page)
        # 验证 chip 出现
        chips = page.locator(".el-tag.traits-tab__preset-chip")
        chip_texts = [(await chips.nth(i).text_content() or "").strip() for i in range(await chips.count())]
        print(f"  A chips after neg create: {chip_texts}")
        assert any(f"E2E-NEG-{TS}" in t for t in chip_texts), "FAIL: -1.5 preset not in chip list"

        # === Case 2: 拖到 +1.8(原 max=1 拒)===
        print(f"\n=== Case 2: all 5 sliders → +1.8 (was rejected by max=1) ===")
        ok_pos = await create_preset(page, PRESET_KEY_POS, f"E2E-POS-{TS}", 1.8)
        print(f"  Create with +1.8: ok={ok_pos}")
        assert ok_pos, "FAIL: preset with OCEAN=1.8 was rejected (DTO max still 1?)"

        await click_personality_tab(page)
        chips = page.locator(".el-tag.traits-tab__preset-chip")
        chip_texts = [(await chips.nth(i).text_content() or "").strip() for i in range(await chips.count())]
        print(f"  A chips after pos create: {chip_texts}")
        assert any(f"E2E-POS-{TS}" in t for t in chip_texts), "FAIL: +1.8 preset not in chip list"

        # === Cleanup: 删除两个测试预设 ===
        print(f"\n=== Cleanup: delete -1.5 and +1.8 presets ===")
        deleted_neg = await delete_preset_by_label(page, f"E2E-NEG-{TS}")
        print(f"  Delete -1.5 preset: {deleted_neg}")
        await click_personality_tab(page)
        deleted_pos = await delete_preset_by_label(page, f"E2E-POS-{TS}")
        print(f"  Delete +1.8 preset: {deleted_pos}")
        assert deleted_neg and deleted_pos, "cleanup failed"

        if errors:
            critical = [e for e in errors if "TypeError" in e or "ReferenceError" in e or "min" in e]
            if critical:
                print(f"\n=== Critical errors ===\n{critical[:5]}")
                return 1

        print("\n=== SLIDER OUT-OF-RANGE SAVE OK ===")
        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))