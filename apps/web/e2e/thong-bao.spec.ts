import { expect, test } from "@playwright/test";
import { openFeature, readDialogue, register, shot } from "./helpers";

// Góp ý đợt 4: thông báo (toast) không che thanh trạng thái — nằm giữa hai cột icon neo, dưới thanh thông tin; mở sheet
// rồi vẫn thấy thông báo nổi trên cùng.
test("thông báo nằm giữa hai cột icon, không che thanh trạng thái", async ({ page }) => {
  await register(page, "Thông báo");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  // Chợ ở xa → toast "🚶 Đang đi tới Chợ đầu mối…".
  await openFeature(page, "market");
  const toast = page.locator("[data-toasts-inline]");
  await expect(toast).toBeVisible();
  const t = await toast.boundingBox();
  const bar = await page.locator("[data-status-bar]").boundingBox();
  const left = await page.locator('[data-anchor-rail="left"]').boundingBox();
  const right = await page.locator('[data-anchor-rail="right"]').boundingBox();
  if (!t || !bar || !left || !right) throw new Error("thiếu phần tử");
  expect(t.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(t.x).toBeGreaterThanOrEqual(left.x + left.width - 1);
  expect(t.x + t.width).toBeLessThanOrEqual(right.x + 1);
  await shot(page, "106-thong-bao");

  // Mở sheet Ví rồi gây một thông báo lỗi: thông báo vẫn nổi trên sheet.
  await page.locator("[data-money]").tap();
  await expect(page.getByRole("dialog", { name: /Ví tiền/ })).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { xomDebug: { send: (e: string, p: unknown) => Promise<unknown> } }
    ).xomDebug.send("rent:pay", {}),
  );
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox();
  if (!box) throw new Error("không thấy thông báo");
  const top = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-toasts-inline]"),
    [box.x + box.width / 2, box.y + 10] as const,
  );
  expect(top).toBe(true);
});
