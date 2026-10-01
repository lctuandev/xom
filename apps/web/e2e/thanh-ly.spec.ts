import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Thanh lý hàng tồn (góp ý chơi thử): mua dư hàng → ra chợ Bà Năm bán lại với giá thấp.
test("thanh lý hàng tồn cho chợ Bà Năm", async ({ page }) => {
  await register(page, "Lý");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await page.getByRole("button", { name: "Ra chợ" }).tap();
  const market = page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" });
  await expect(market.locator('[data-item="pate"]')).toBeVisible({ timeout: 40_000 });
  await market.locator('[data-item="pate"]').getByRole("button", { name: /^Mua/ }).tap();
  await expect(market.locator('[data-item="pate"]').getByText(/trong kho [1-9]/)).toBeVisible();
  const money = Number(await page.locator("[data-money]").getAttribute("data-money"));

  await market.getByText(/♻️ Thanh lý hàng tồn/).tap();
  await market
    .locator("[data-liquidate]")
    .getByRole("button", { name: /Bán lại · / })
    .tap();
  await expect(market.locator("[data-liquidate]")).toHaveCount(0);
  await expect
    .poll(async () => Number(await page.locator("[data-money]").getAttribute("data-money")))
    .toBeGreaterThan(money);
  await shot(page, "80-thanh-ly");
});
