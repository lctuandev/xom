import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Góc nhìn tự do (docs/USECASES.md UC-B7): vặn hai ngón để xoay quanh nhân vật.
test("vặn hai ngón xoay góc nhìn", async ({ page }) => {
  await register(page, "Xoay");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const canvas = page.locator("canvas").first();
  await page.waitForTimeout(800);
  const before = await canvas.screenshot();

  // Hai ngón đặt giữa màn hình, vặn 90° (sự kiện chạm thật qua CDP).
  const cdp = await page.context().newCDPSession(page);
  const cx = 200;
  const cy = 420;
  const r = 70;
  const touch = (a: number) => [
    { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, id: 1 },
    { x: cx - Math.cos(a) * r, y: cy - Math.sin(a) * r, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(0) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: touch((i / 12) * (Math.PI / 2)),
    });
    await page.waitForTimeout(30);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(1200);
  const rotated = await canvas.screenshot();
  expect(rotated.equals(before)).toBe(false);
  await shot(page, "30-xoay");
});
