"""直接在浏览器内 fetch 验证 getTraits 响应,绕过 token 提取。"""
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
        await page.goto("http://localhost:5175/login", wait_until="networkidle", timeout=20000)
        await page.fill("input[placeholder*='账号']", USERNAME)
        await page.fill("input[type='password']", PASSWORD)
        await page.click("button:has-text('登录')")
        await asyncio.sleep(2)
        # 用 page.evaluate 直接调 axios(走前端拦截器,自动带 auth header)
        result = await page.evaluate("""
            async () => {
                try {
                    const mod = await import('/src/api/roleCore.ts');
                    const r = await mod.getTraits(51);
                    return {
                        listLen: r?.list?.length ?? 0,
                        active: r?.activePresetType ?? null,
                        presetsLen: r?.presets?.length ?? 0,
                        firstPreset: r?.presets?.[0] ? {
                            key: r.presets[0].key,
                            label: r.presets[0].label,
                            isProtected: r.presets[0].isProtected,
                        } : null,
                        presetsKeys: r?.presets?.map(p => p.key) ?? [],
                        rawKeys: Object.keys(r ?? {}),
                    };
                } catch (e) {
                    return { error: e.message };
                }
            }
        """)
        print(f"Result: {result}")
        await b.close()


asyncio.run(main())