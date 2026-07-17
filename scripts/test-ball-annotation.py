import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "validation" / "local" / "videos" / "behind-back-01" / "behind-back-01-000.mp4"
SCHEDULE = ROOT / "validation" / "labels" / "ball" / "calibration-representative-v1.json"

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", headless=True)
        page = await browser.new_page()
        await page.goto(f"{os.environ.get('BALL_ANNOTATION_BASE_URL', 'http://127.0.0.1:3000')}/validation-runner", wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_timeout(2_000)
        await page.get_by_role("button", name="Upload benchmark").click()
        await page.locator('input[type="file"]').wait_for(state="attached", timeout=60_000)
        await page.locator('input[type="file"]').set_input_files(str(VIDEO))
        await page.get_by_text("Video ready to analyze.").wait_for(timeout=60_000)
        await page.get_by_role("button", name="Create 20-frame schedule").click()
        await page.get_by_text("0/20 scheduled").wait_for()
        assert await page.get_by_role("button", name="Create 20-frame schedule").is_disabled()
        await page.get_by_label("Ball appearance").select_option("black")
        await page.get_by_label("Pseudonymous player ID").fill("player-smoke")
        await page.get_by_label("Lighting condition").fill("indoor-smoke")
        await page.get_by_text("Hard-negative footage").click()
        await page.locator("video").evaluate("video => { video.pause(); video.currentTime = 13; }")
        await page.get_by_role("button", name="Draw ball box").click()
        preview = page.locator("video").locator("..")
        await preview.scroll_into_view_if_needed()
        bounds = await preview.bounding_box()
        assert bounds
        await page.mouse.move(bounds["x"] + bounds["width"] * 0.52, bounds["y"] + bounds["height"] * 0.43)
        await page.mouse.down()
        await page.mouse.move(bounds["x"] + bounds["width"] * 0.59, bounds["y"] + bounds["height"] * 0.54)
        await page.mouse.up()
        await page.get_by_text("1 labeled frames").wait_for()
        await page.get_by_role("button", name="+0.1s").click()
        await page.get_by_role("button", name="No ball in scene").click()
        await page.get_by_text("2 labeled frames").wait_for()
        await page.get_by_role("button", name="+0.1s").click()
        await page.get_by_role("button", name="Ball temporarily occluded").click()
        await page.get_by_text("3 labeled frames").wait_for()
        await page.get_by_text("temporarily occluded", exact=True).wait_for()
        async with page.expect_download() as download_info:
            await page.get_by_role("button", name="Export ball labels").click()
        download = await download_info.value
        sidecar_path = Path(await download.path())
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
        assert [label["visibility"] for label in sidecar["labels"]] == ["visible", "absent", "occluded"]
        assert sidecar["capture"] == {"ballAppearance": "black", "playerId": "player-smoke", "lighting": "indoor-smoke", "hardNegative": True}
        for _ in range(3):
            await page.get_by_role("button", name="Delete").last.click()
        await page.get_by_text("0 labeled frames").wait_for()
        await page.locator('input[accept="application/json"]').set_input_files(str(sidecar_path))
        await page.get_by_text("Imported 3 independent ball labels.").wait_for()
        await page.get_by_text("3 labeled frames").wait_for()
        await page.get_by_text("temporarily occluded", exact=True).wait_for()
        assert await page.get_by_label("Ball appearance").input_value() == "black"
        assert await page.get_by_label("Pseudonymous player ID").input_value() == "player-smoke"
        await page.locator('input[accept="application/json"]').set_input_files(str(SCHEDULE))
        await page.get_by_text("Imported 12 scheduled ball-label frames.").wait_for()
        await page.get_by_role("button", name="Next scheduled frame").wait_for()
        await page.get_by_text("0/12 scheduled").wait_for()
        print("ball annotation draw/absent/occluded/delete/import/export/schedule workflow passed")
        await browser.close()

asyncio.run(main())
