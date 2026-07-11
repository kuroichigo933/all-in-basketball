import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
VIDEO = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "validation" / "local" / "fake-camera.y4m"

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            headless=True,
            args=["--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={VIDEO}"],
        )
        context = await browser.new_context(permissions=["camera"])
        page = await context.new_page()
        await page.goto("http://127.0.0.1:3000/validation-runner", wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_timeout(2_000)
        await page.get_by_role("button", name="Start front camera").click()
        await page.get_by_text("Live tracking active", exact=False).wait_for(timeout=120_000)
        await page.wait_for_timeout(7_000)
        await page.get_by_role("button", name="Full screen").click()
        await page.wait_for_timeout(8_000)
        expanded_tracking = await page.locator("section").filter(has_text="Tracking confidence").inner_text()
        await page.get_by_role("button", name="Exit full screen").click()
        await page.wait_for_timeout(10_000)
        tracking = await page.locator("section").filter(has_text="Tracking confidence").inner_text()
        repetitions = await page.locator("section").filter(has_text="Repetitions").inner_text()
        events = await page.locator("section").filter(has_text="Recent moves").inner_text()
        await page.get_by_role("button", name="Stop camera").click()
        stopped = await page.get_by_text("Camera stopped.").is_visible()
        print(json.dumps({"trackingDuringExpandedView": expanded_tracking, "tracking": tracking, "repetitions": repetitions, "events": events, "cameraStopped": stopped}, indent=2))
        await browser.close()

asyncio.run(main())
