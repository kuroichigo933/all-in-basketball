import asyncio
import json
import re
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
VIDEO = (Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "validation" / "local" / "fake-camera.y4m").resolve()
EXPORT_PATH = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else None

async def main():
    async with async_playwright() as playwright:
        diagnostics = {"consoleErrors": [], "pageErrors": [], "failedRequests": []}
        browser = await playwright.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            headless=True,
            args=["--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={VIDEO}"],
        )
        context = await browser.new_context(permissions=["camera"])
        page = await context.new_page()
        page.on("console", lambda message: diagnostics["consoleErrors"].append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: diagnostics["pageErrors"].append(str(error)))
        page.on("requestfailed", lambda request: diagnostics["failedRequests"].append({"url": request.url, "failure": request.failure}))
        await page.goto("http://127.0.0.1:3000/validation-runner", wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_timeout(2_000)
        await page.get_by_role("button", name="Start front camera").click()
        try:
            await page.get_by_text("Live tracking active", exact=False).wait_for(timeout=120_000)
        except Exception:
            status_text = await page.locator("body").inner_text()
            print(json.dumps({"startupFailed": True, "status": status_text[-2_000:], "diagnostics": diagnostics}, indent=2))
            raise
        await page.wait_for_timeout(7_000)
        before_expanded_time = await page.locator("video").evaluate("video => video.currentTime")
        await page.get_by_role("button", name="Full screen").click()
        await page.wait_for_timeout(8_000)
        expanded_time = await page.locator("video").evaluate("video => video.currentTime")
        expanded_tracking = await page.get_by_role("heading", name="Tracking confidence").locator("..").inner_text()
        await page.get_by_role("button", name="Exit full screen").last.click()
        await page.wait_for_timeout(10_000)
        final_time = await page.locator("video").evaluate("video => video.currentTime")
        tracking = await page.get_by_role("heading", name="Tracking confidence").locator("..").inner_text()
        repetitions = await page.get_by_role("heading", name="Repetitions").locator("..").inner_text()
        events = await page.get_by_role("heading", name="Recent moves").locator("..").inner_text()
        assert expanded_time > before_expanded_time + 5, "Camera video time did not advance in expanded view."
        assert final_time > expanded_time + 7, "Camera video time did not advance after leaving expanded view."
        assert "in and out" not in events.lower() and "hesitation" not in events.lower(), "Unsupported live move reached the event feed."
        measured_match = re.search(r"Measured ball frames\s+(\d+)%", tracking)
        samples_match = re.search(r"Samples\s+(\d+)", tracking)
        if not measured_match or int(measured_match.group(1)) == 0:
            print(json.dumps({"trackingDuringExpandedView": expanded_tracking, "tracking": tracking, "repetitions": repetitions, "events": events, "diagnostics": diagnostics}, indent=2))
        assert measured_match and int(measured_match.group(1)) > 0, "No measured ball frames were reported."
        assert samples_match and int(samples_match.group(1)) > 0, "No live inference samples were reported."
        if EXPORT_PATH:
            async with page.expect_download() as download_info:
                await page.get_by_role("button", name="Export live observations").click()
            download = await download_info.value
            await download.save_as(EXPORT_PATH)
        await page.get_by_role("button", name="Stop camera").click()
        await page.get_by_text("Camera stopped.").wait_for(timeout=10_000)
        stopped = True
        print(json.dumps({"trackingDuringExpandedView": expanded_tracking, "tracking": tracking, "repetitions": repetitions, "events": events, "videoTimes": {"beforeExpanded": before_expanded_time, "expanded": expanded_time, "final": final_time}, "export": str(EXPORT_PATH) if EXPORT_PATH else None, "diagnostics": diagnostics, "cameraStopped": stopped}, indent=2))
        await browser.close()

asyncio.run(main())
