import { expect, test } from "@playwright/test";
import { openBanhMiStall, register, shot } from "./helpers";

// Thanh lý hàng tồn (góp ý chơi thử): mua dư hàng → ra chợ Bà Năm bán lại với giá thấp.
test("thanh lý hàng tồn cho chợ Bà Năm", async ({ page }) => {
  await register(page, "Lý");
  // Hàng nhập về kho của quầy (kho riêng từng cửa hàng — UC-F14): có xe hàng rồi mới mua dư được.
  await openBanhMiStall(page);
  await page.locator('[data-anchor="market"]').tap();
  const market = page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" });
  await expect(market.locator('[data-item="pate"]')).toBeVisible({ timeout: 40_000 });
  await market.locator('[data-item="pate"]').getByRole("button", { name: /^Mua/ }).tap();
  await expect(market.locator('[data-item="pate"]').getByText(/trong kho [1-9]/)).toBeVisible();
  const money = Number(await page.locator("[data-money]").getAttribute("data-money"));

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
