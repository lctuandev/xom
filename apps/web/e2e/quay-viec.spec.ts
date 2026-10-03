import { expect, test } from "@playwright/test";
import { openBanhMiStall, openFeature, register, shot, waitForMorning } from "./helpers";

// Sheet Quầy gọn theo mặt hàng (docs/USECASES.md UC-F15): 4 thẻ việc của quầy có tình trạng; bấm thẻ mở đúng chức năng
// (có ‹ Quay lại); "Nhập hàng" đi ra chợ, chợ chỉ hiện nguyên liệu của quầy (hàng khác sau "Xem hàng khác").
test("sheet Quầy: thẻ việc của quầy — thực đơn, nhập hàng", async ({ page }) => {
  test.setTimeout(300_000);
  await register(page, "Quầy");
  await waitForMorning(page, 10);
  // Vựa xe ghi rõ đang chọn mặt hàng bán.
  await openBanhMiStall(page);

  await openFeature(page, "stall");
  const tasks = page.locator("[data-stall-task]");
  await expect(tasks).toHaveCount(4);
  await expect(page.locator('[data-stall-task="market"]')).toContainText(/Còn làm được \d+ phần/);
  await expect(page.locator('[data-stall-task="lot"]')).toContainText("Đầu hẻm 12");
  await expect(page.locator('[data-stall-task="dishes"]')).toContainText(/\d+\/\d+ món đang bán/);
  await shot(page, "97-quay-the-viec");

  // Thẻ Thực đơn → sheet Thực đơn & giá, ‹ Quay lại về Quầy.
  await page.locator('[data-stall-task="dishes"]').tap();
  await expect(page.getByRole("dialog", { name: /Thực đơn & giá/ })).toBeVisible();
  await page.getByRole("button", { name: "Quay lại" }).tap();
  await expect(page.locator("[data-stall-task]")).toHaveCount(4);

  // Thẻ Nhập hàng → tự đi ra chợ, tab hàng của quầy mở sẵn.
  await page.locator('[data-stall-task="market"]').tap();
  const market = page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" });
  await expect(market).toBeVisible({ timeout: 40_000 });
  await expect(market.locator('[data-group="mine"]')).toBeVisible();
  await expect(market.locator('[data-item="banh_mi_phoi"]')).toBeVisible();
  // Chỉ hàng của quầy; hàng nghề khác (trà sữa) nằm sau "Xem hàng khác".
  await expect(market.locator('[data-item="cot_tra_sua"]')).toHaveCount(0);
  await market.getByRole("button", { name: /Xem hàng khác/ }).tap();
  await expect(market.getByRole("tablist", { name: "Quầy hàng ở chợ" })).toBeVisible();
  await shot(page, "98-cho-hang-cua-quay");
});
