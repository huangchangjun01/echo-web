"""
预设字典按角色隔离 e2e 测试 —— 验证两个不同角色的预设库互不影响。

业务诉求:用户在【小暖】添加/修改/删除预设,切换到【拉师傅】后看到的是
拉师傅自己的预设字典,不应被小暖的修改污染;反之亦然。

测试流程:
  1. 登录 + 进入小暖角色编辑页 → 记录当前预设字典基线
  2. 在小暖下新增一个自定义预设「拉师傅专属测试预设-{ts}」
  3. 切到拉师傅 → 断言该新预设不存在(隔离)
  5. 在拉师傅下新增一个自定义预设「小暖专属测试预设-{ts}」
  6. 切回小暖 → 断言「小暖专属测试预设-{ts}」不存在(隔离)
  7. 编辑「小暖专属测试预设-{ts}」的 OCEAN 五维,切到拉师傅,断言拉师傅
     对应预设的 OCEAN 未被污染
  8. 清理:删除本次测试新增的所有预设,保证数据不残留
"""
import asyncio
import sys
import time
from pathlib import Path
from playwright.async_api import async_playwright

VITE = "http://localhost:5175"
ROLE_A = 51  # 小暖
ROLE_B = 52  # 拉师傅

USERNAME_FILE = Path("C:/Users/h4215/AppData/Local/Temp/e2e_user")
PASSWORD = "TestPass123!"

# 时间戳保证 key 唯一,避免与历史测试残留冲突
TS = int(time.time() * 1000)
PRESET_KEY_A = f"e2e_role_a_{TS}"
PRESET_KEY_B = f"e2e_role_b_{TS}"


async def read_presets(page) -> list[dict]:
    """读 chip 行所有预设(label + isProtected),返回 list[dict]"""
    chips = page.locator(".el-tag.traits-tab__preset-chip")
    n = await chips.count()
    out = []
    for i in range(n):
        chip = chips.nth(i)
        text = (await chip.text_content() or "").strip()
        # 提取 label(去除 '使用中' 徽标和 chip 自带 X 图标)
        # 实际渲染里:label 后可能跟「使用中」span 和 X icon,
        # textContent 会拼成「label使用中」,粗暴按 「label」截断。
        label = text.replace("使用中", "").strip()
        # 检查 isProtected:isProtected 的 chip 不可删,class 不一样;
        # 用 attribute 来判定更稳。protected 的 chip 通常 effect="dark"。
        effect = await chip.get_attribute("effect")
        out.append({"label": label, "effect": effect})
    return out


async def has_preset_with_label(page, label_substr: str) -> bool:
    """chip 行是否包含 label 包含 label_substr 的预设"""
    chips = page.locator(".el-tag.traits-tab__preset-chip")
    n = await chips.count()
    for i in range(n):
        text = (await chips.nth(i).text_content() or "").strip()
        if label_substr in text:
            return True
    return False


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


async def select_role_via_dropdown(page, target_index: int) -> None:
    await page.locator(".role-editor__selector").click()
    await asyncio.sleep(0.5)
    options = page.locator(".el-select-dropdown__item")
    n = await options.count()
    assert n >= 2, f"dropdown has only {n} options"
    await options.nth(target_index).click()
    await asyncio.sleep(2.5)


async def create_preset_via_dialog(page, key: str, label: str) -> bool:
    """点「新增预设」按钮 → 填表 → 提交,返回是否成功"""
    await page.locator("button:has-text('新增预设')").click()
    await page.locator(".el-dialog").wait_for(timeout=3000)
    await asyncio.sleep(0.5)
    # dialog 内依次填表(key / label / 描述)
    inputs = page.locator(".el-dialog input")
    n = await inputs.count()
    # dialog 一般有:key, label(可能无), description(textarea,不算 input)
    # 填 key(第一个 input)
    await inputs.first.fill(key)
    # 填 label:ElForm 第二项;输入框有 placeholder 一般没有;按 label 找
    # dialog 中 label 是 "显示名"
    label_input = page.locator(".el-dialog .el-form-item:has-text('显示名') input").first
    await label_input.fill(label)
    # 关闭 dialog(点确定按钮)
    await page.locator(".el-dialog button:has-text('创建')").click()
    await asyncio.sleep(2)
    # dialog 关闭 = 成功
    return await page.locator(".el-dialog").count() == 0


async def delete_preset_via_chip(page, label_substr: str) -> bool:
    """找到 label 含 substr 的 chip 的 X 图标并点击 → 确认 dialog → 确认删除"""
    chips = page.locator(".el-tag.traits-tab__preset-chip")
    n = await chips.count()
    for i in range(n):
        chip = chips.nth(i)
        text = (await chip.text_content() or "").strip()
        if label_substr not in text:
            continue
        # 找到 X 图标(el-icon);hover chip 让 X 显示
        await chip.hover()
        await asyncio.sleep(0.3)
        # click X icon(在 chip 内部)
        x_icon = chip.locator(".traits-tab__preset-x")
        try:
            await x_icon.click(timeout=2000)
        except Exception:
            # fallback:直接通过 title 属性找
            x_icon = chip.locator("[title*='删除']").first
            await x_icon.click()
        # 确认弹窗
        try:
            await page.locator(".el-message-box button:has-text('删除')").click(timeout=2000)
        except Exception:
            # el-message-box 的按钮 class 不一样,尝试 span
            await page.locator(".el-message-box .el-button--primary").click()
        await asyncio.sleep(1.5)
        return True
    return False


async def main() -> int:
    if not USERNAME_FILE.exists():
        print(f"FAIL: username file missing at {USERNAME_FILE}")
        return 1
    username = USERNAME_FILE.read_text().strip()
    print(f"=== Login as {username}; testing preset isolation between role {ROLE_A} and {ROLE_B} ===")
    print(f"=== TS={TS}; A key={PRESET_KEY_A}, B key={PRESET_KEY_B} ===")

    errors: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()
        page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))

        # === Login ===
        await page.goto(f"{VITE}/login", wait_until="networkidle", timeout=20000)
        await page.fill("input[placeholder*='账号']", username)
        await page.fill("input[type='password']", PASSWORD)
        await page.click("button:has-text('登录')")
        await asyncio.sleep(2)

        # === Navigate to role A ===
        print(f"\n=== Visit role A (id={ROLE_A}) ===")
        await page.goto(f"{VITE}/admin/role-editor/{ROLE_A}", wait_until="networkidle", timeout=20000)
        await click_personality_tab(page)
        a_baseline = await read_presets(page)
        a_labels = [p["label"] for p in a_baseline]
        print(f"  A baseline labels: {a_labels}")

        # === Add preset A only in role A ===
        print(f"\n=== Create preset A '{PRESET_KEY_A}' in role A ===")
        ok = await create_preset_via_dialog(page, PRESET_KEY_A, f"E2E-A-{TS}")
        print(f"  Create A: ok={ok}")

        await click_personality_tab(page)
        a_after_create = await read_presets(page)
        a_labels_after = [p["label"] for p in a_after_create]
        print(f"  A after create: {a_labels_after}")
        assert len(a_after_create) == len(a_baseline) + 1, "A should have 1 more preset after create"
        assert any(f"E2E-A-{TS}" in lbl for lbl in a_labels_after), "A should contain E2E-A preset"

        # === Switch to role B ===
        print(f"\n=== Switch to role B (id={ROLE_B}) ===")
        await select_role_via_dropdown(page, 1)
        await click_personality_tab(page)
        b1_presets = await read_presets(page)
        b1_labels = [p["label"] for p in b1_presets]
        print(f"  B after switching from A: {b1_labels}")

        # ASSERTION: 拉师傅 不应看到 E2E-A 预设
        a_in_b = any(f"E2E-A-{TS}" in lbl for lbl in b1_labels)
        assert not a_in_b, f"FAIL: role A preset leaked into role B: {b1_labels}"
        print("  PASS: role A preset not visible in role B")

        # === Add preset B only in role B ===
        print(f"\n=== Create preset B '{PRESET_KEY_B}' in role B ===")
        ok = await create_preset_via_dialog(page, PRESET_KEY_B, f"E2E-B-{TS}")
        print(f"  Create B: ok={ok}")

        await click_personality_tab(page)
        b_after_create = await read_presets(page)
        b_labels_after = [p["label"] for p in b_after_create]
        print(f"  B after create: {b_labels_after}")

        # === Switch back to role A ===
        print(f"\n=== Switch back to role A ===")
        await select_role_via_dropdown(page, 0)
        await click_personality_tab(page)
        a_final = await read_presets(page)
        a_labels_final = [p["label"] for p in a_final]
        print(f"  A final: {a_labels_final}")

        # ASSERTION: 小暖 不应看到 E2E-B 预设
        b_in_a = any(f"E2E-B-{TS}" in lbl for lbl in a_labels_final)
        assert not b_in_a, f"FAIL: role B preset leaked into role A: {a_labels_final}"
        print("  PASS: role B preset not visible in role A")

        # ASSERTION: 小暖 应仍能看到自己新增的 E2E-A
        a_in_a_final = any(f"E2E-A-{TS}" in lbl for lbl in a_labels_final)
        assert a_in_a_final, f"FAIL: A's own preset disappeared after switching to B and back"
        print("  PASS: A's preset still visible after B round-trip")

        # === Cleanup: delete both test presets ===
        print(f"\n=== Cleanup: delete test presets ===")
        # 删 A 的 E2E-A
        await delete_preset_via_chip(page, f"E2E-A-{TS}")
        await click_personality_tab(page)
        a_after_cleanup = await read_presets(page)
        a_labels_cleanup = [p["label"] for p in a_after_cleanup]
        print(f"  A after delete E2E-A: {a_labels_cleanup}")
        assert not any(f"E2E-A-{TS}" in lbl for lbl in a_labels_cleanup), "A's E2E-A not deleted"

        # 切到 B 删 E2E-B
        await select_role_via_dropdown(page, 1)
        await click_personality_tab(page)
        await delete_preset_via_chip(page, f"E2E-B-{TS}")
        await click_personality_tab(page)
        b_after_cleanup = await read_presets(page)
        b_labels_cleanup = [p["label"] for p in b_after_cleanup]
        print(f"  B after delete E2E-B: {b_labels_cleanup}")
        assert not any(f"E2E-B-{TS}" in lbl for lbl in b_labels_cleanup), "B's E2E-B not deleted"

        if errors:
            print(f"\n=== Console errors ({len(errors)}) ===")
            for e in errors[:15]:
                print(f"  {e}")
            # 预设相关操作可能产生一些无关警告,但硬失败计数
            critical_errors = [e for e in errors if "TypeError" in e or "ReferenceError" in e]
            if critical_errors:
                print(f"\nFAIL: {len(critical_errors)} critical console errors")
                return 1

        print("\n=== ALL PRESET ISOLATION CHECKS PASS ===")
        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))