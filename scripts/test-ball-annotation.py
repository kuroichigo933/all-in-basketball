import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "validation" / "local" / "videos" / "behind-back-01" / "behind-back-01-000.mp4"

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", headless=True)
        page = await browser.new_page()
        await page.goto("http://127.0.0.1:3000/validation-runner", wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_timeout(2_000)
        await page.get_by_role("button", name="Upload benchmark").click()
        await page.locator('input[type="file"]').wait_for(state="attached", timeout=60_000)
        await page.locator('input[type="file"]').set_input_files(str(VIDEO))
        await page.get_by_text("Video ready to analyze.").wait_for(timeout=60_000)
        await page.locator("video").evaluate("video => { video.pause(); video.currentTime = 13; }")
        await page.get_by_role("button", name="Draw ball box").click()
        preview = page.locator("video").locator("..")
        bounds = await preview.bounding_box()
        assert bounds
        await page.mouse.move(bounds["x"] + bounds["width"] * 0.52, bounds["y"] + bounds["height"] * 0.43)
        await page.mouse.down()
        await page.mouse.move(bounds["x"] + bounds["width"] * 0.59, bounds["y"] + bounds["height"] * 0.54)
        await page.mouse.up()
        await page.get_by_text("1 labeled frames").wait_for()
        await page.get_by_role("button", name="+0.1s").click()
        await page.get_by_role("button", name="No ball in frame").click()
        await page.get_by_text("2 labeled frames").wait_for()
        await page.get_by_role("button", name="Delete").last.click()
        await page.get_by_text("1 labeled frames").wait_for()
        print("ball annotation draw/absent/delete workflow passed")
        await browser.close()

asyncio.run(main())
