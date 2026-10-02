import { expect, test } from "@playwright/test";
import { closeSheet, openBanhMiStall, openFeature, register, shot } from "./helpers";

// Thanh lý hàng tồn (góp ý chơi thử): mua dư hàng → ra chợ Bà Năm bán lại với giá thấp.
test("thanh lý hàng tồn cho chợ Bà Năm", async ({ page }) => {
  await register(page, "Lý");
  // Hàng nhập về kho của quầy (UC-F14) — có xe hàng; đóng quầy để tiền mặt chỉ đổi vì đi chợ.
  await openBanhMiStall(page);
  await openFeature(page, "stall");
  await page.getByRole("button", { name: "Đóng quầy" }).tap();
  await closeSheet(page);
  await page.locator('[data-anchor="market"]').tap();
  const market = page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" });
  await expect(market.locator('[data-item="pate"]')).toBeVisible({ timeout: 40_000 });
  const cash = async () => Number(await page.locator("[data-money]").getAttribute("data-money"));
  const before = await cash();
  await market.locator('[data-item="pate"]').getByRole("button", { name: /^Mua/ }).tap();
  // Kho có sẵn pate của quầy → chờ tiền mua trừ xong rồi mới chốt số tiền trước khi thanh lý.
  await expect.poll(cash).toBeLessThan(before);
  const money = await cash();

  // Thanh lý là sheet riêng (♻️), mở từ nút cuối bảng chợ.
  await market.getByRole("button", { name: /♻️ Thanh lý hàng tồn/ }).tap();
  const sell = page.getByRole("dialog", { name: "♻️ Thanh lý hàng tồn" });
  const pate = sell.locator('[data-liquidate-item="pate"]');
  await pate.getByRole("button", { name: /Bán lại · / }).tap();
  await expect(pate).toHaveCount(0);
  await expect
    .poll(async () => Number(await page.locator("[data-money]").getAttribute("data-money")))
    .toBeGreaterThan(money);
  await shot(page, "80-thanh-ly");
});
