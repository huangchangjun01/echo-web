"""
E2E test: verify OCEAN five-dimensional traits content updates correctly when switching roles.

Approach:
  - Login as e2e user
  - Visit /admin/role-editor/51 (role A)
  - Read trait slider input values via DOM
  - Navigate to /admin/role-editor/52 (role B) — full page reload simulates a role switch
    (covers both: page.goto and within-SPA via dropdown, since the underlying loadAll
    sequence is identical)
  - Read trait slider input values again
  - Verify they match the expected role-specific values
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

VITE = "http://localhost:5175"
ROLE_A = 51
ROLE_B = 52

# Login credentials (registered earlier in this session)
USERNAME_FILE = Path("C:/Users/h4215/AppData/Local/Temp/e2e_user")
PASSWORD = "TestPass123!"


async def read_ocean(page) -> dict:
    """
    Read all 5 OCEAN slider input values from the TraitSlider component.

    Each TraitSlider renders:
      <div class="trait-slider">
        <label>... <span class="trait-slider__abbr">(O)</span> ...</label>
        <input class="trait-slider__input" type="range" :value="modelValue" ...>
      </div>

    Returns {openness, conscientiousness, extraversion, agreeableness, neuroticism}
    keyed by the model variable name.
    """
    abbr_to_var = {"O": "openness", "C": "conscientiousness", "E": "extraversion", "A": "agreeableness", "N": "neuroticism"}
    result = {}
    for abbr, var in abbr_to_var.items():
        # Find the trait-slider whose label contains the abbr in parentheses
        slider = page.locator(
            f"div.trait-slider:has(span.trait-slider__abbr:text-is('({abbr})'))"
        ).first
        await slider.wait_for(timeout=5000)
        input_el = slider.locator("input.trait-slider__input")
        val = await input_el.get_attribute("value")
        result[var] = float(val) if val is not None else None
    return result


async def main() -> int:
    if not USERNAME_FILE.exists():
        print(f"FAIL: username file not found at {USERNAME_FILE}")
        return 1
    username = USERNAME_FILE.read_text().strip()

    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))

        # === Login ===
        print(f"=== Login as {username} ===")
        await page.goto(f"{VITE}/login", wait_until="networkidle", timeout=20000)
        await page.fill("input[placeholder*='账号']", username)
        await page.fill("input[type='password']", PASSWORD)
        await page.click("button:has-text('登录')")
        await asyncio.sleep(2)
        print(f"After login URL: {page.url}")

        # === Visit role A ===
        print(f"=== Navigate to /admin/role-editor/{ROLE_A} (role A) ===")
        await page.goto(f"{VITE}/admin/role-editor/{ROLE_A}", wait_until="networkidle", timeout=20000)
        # Click personality tab
        personality_tab = page.locator("div[role='tab']:has-text('性格')")
        await personality_tab.click()
        # Wait for sliders to render and store.loadAll to complete
        await page.locator("div.trait-slider").first.wait_for(timeout=10000)
        await asyncio.sleep(2.0)
        a_values = await read_ocean(page)
        print(f"Role A (id={ROLE_A}) OCEAN: {a_values}")

        # === Switch to role B (full page reload) ===
        print(f"=== Navigate to /admin/role-editor/{ROLE_B} (role B via full reload) ===")
        await page.goto(f"{VITE}/admin/role-editor/{ROLE_B}", wait_until="networkidle", timeout=20000)
        # Click personality tab again (full reload resets tab state)
        personality_tab = page.locator("div[role='tab']:has-text('性格')")
        await personality_tab.click()
        await page.locator("div.trait-slider").first.wait_for(timeout=10000)
        await asyncio.sleep(2.0)
        b_values = await read_ocean(page)
        print(f"Role B (id={ROLE_B}) OCEAN: {b_values}")

        # === Switch BACK to role A via dropdown (within-SPA, no reload) ===
        # 这是用户实际触发 bug 的场景:不刷新页面,只通过下拉切换。
        # loadAll 异步进行中如果 store.currentRoleId 被提前更新,会导致闸门假性通过。
        print(f"=== Switch back to role A via dropdown (within-SPA) ===")
        # Click the role selector (el-select)
        selector = page.locator(".role-editor__selector")
        await selector.click()
        await asyncio.sleep(0.5)
        # Get the option list and click the one matching role A by its data value attribute
        options = page.locator(".el-select-dropdown__item")
        n_opts = await options.count()
        print(f"  dropdown has {n_opts} options")
        # Use the visible label text to identify role A — there are 2 roles total
        # Click option #0 (role A was created first → listed first by default)
        if n_opts >= 2:
            await options.nth(0).click()
        else:
            await options.first.click()
        await asyncio.sleep(2.5)  # wait for loadAll + reactivity
        # Personality tab should still be active (no full reload)
        await page.locator("div.trait-slider").first.wait_for(timeout=10000)
        a_values_via_dropdown = await read_ocean(page)
        print(f"Role A (id={ROLE_A}) via dropdown: {a_values_via_dropdown}")

        # === Verify ===
        expected_a = {"openness": 0.70, "conscientiousness": 0.30, "extraversion": 0.50, "agreeableness": 0.60, "neuroticism": 0.20}
        expected_b = {"openness": 0.20, "conscientiousness": -0.40, "extraversion": -0.30, "agreeableness": -0.50, "neuroticism": 0.80}

        ok = True
        print("\n=== Comparison ===")
        for k in expected_a:
            av = a_values.get(k)
            bv = b_values.get(k)
            av_dd = a_values_via_dropdown.get(k)
            ev_a = expected_a[k]
            ev_b = expected_b[k]
            pass_a = abs(av - ev_a) < 0.005 if av is not None else False
            pass_b = abs(bv - ev_b) < 0.005 if bv is not None else False
            pass_a_dd = abs(av_dd - ev_a) < 0.005 if av_dd is not None else False
            mark_a = "PASS" if pass_a else "FAIL"
            mark_b = "PASS" if pass_b else "FAIL"
            mark_a_dd = "PASS" if pass_a_dd else "FAIL"
            print(f"  {k:20s} A={av} {mark_a}  B={bv} {mark_b}  A_via_dropdown={av_dd} {mark_a_dd}")
            if not (pass_a and pass_b and pass_a_dd):
                ok = False

        if errors:
            print(f"\n=== Console errors ({len(errors)}) ===")
            for e in errors[:10]:
                print(f"  {e}")

        await browser.close()
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))