import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT / "validation" / "local" / "videos"
OUTPUT = ROOT / "validation" / "observations"

async def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", headless=True)
        page = await browser.new_page(accept_downloads=True)
        videos = sorted(VIDEOS.rglob("*.mp4"))
        if len(sys.argv) > 1:
            videos = [video for video in videos if video.stem == sys.argv[1]]
        for video in videos:
            target = OUTPUT / f"{video.stem}.json"
            if target.exists():
                print(f"skipping existing {video.name}", flush=True)
                continue
            print(f"processing {video.name}", flush=True)
            await page.goto("http://127.0.0.1:3000/validation-runner", wait_until="domcontentloaded", timeout=60_000)
            await page.wait_for_timeout(2_000)
            await page.get_by_role("button", name="Upload benchmark").click()
            await page.locator('input[type="file"]').wait_for(state="attached", timeout=60_000)
            await page.locator('input[type="file"]').set_input_files(str(video))
            analyze = page.get_by_role("button", name="Analyze clip")
            await analyze.wait_for(state="visible")
            await page.wait_for_function("document.querySelector('button.btn-game') && !document.querySelector('button.btn-game').disabled")
            await analyze.click()
            await page.get_by_text("Analysis complete.").wait_for(timeout=600_000)
            async with page.expect_download() as download_info:
                await page.get_by_role("button", name="Export observations").click()
            await (await download_info.value).save_as(target)
        await browser.close()

asyncio.run(main())
