import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Trả bằng gì (docs/USECASES.md UC-I8): người mới có sẵn 1tr trong 🏦 — chọn chuyển khoản thì tiền mặt giữ nguyên;
// chọn 💵 thì trừ tiền mặt.
test("chọn cách trả tiền ở chợ: chuyển khoản / tiền mặt", async ({ page }) => {
  await register(page, "Trả");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await page.locator('[data-anchor="market"]').tap();
  const market = page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" });
  const row = market.locator('[data-item="pate"]');
  await expect(row).toBeVisible({ timeout: 40_000 });

  const money = Number(await page.locator("[data-money]").getAttribute("data-money"));
  await market.getByRole("button", { name: "🏦 Chuyển khoản" }).tap();
  await expect(market.locator("[data-pay]")).toHaveAttribute("data-pay", "bank");
  await row.getByRole("button", { name: /^Mua/ }).tap();
  await expect(row.getByText(/trong kho [1-9]/)).toBeVisible();
  await expect(page.getByText(/🏦 Đã chuyển khoản/).first()).toBeVisible();
  await expect(page.locator("[data-money]")).toHaveAttribute("data-money", String(money));
  await shot(page, "72-tra-bang-gi");

  await market.getByRole("button", { name: "💵 Tiền mặt" }).tap();
  await row.getByRole("button", { name: /^Mua/ }).tap();
  await expect
    .poll(async () => Number(await page.locator("[data-money]").getAttribute("data-money")))
    .toBeLessThan(money);
});
