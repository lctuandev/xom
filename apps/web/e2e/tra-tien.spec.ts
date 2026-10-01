import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Trả bằng gì (docs/USECASES.md UC-I8): chọn 🏦 mà tài khoản trống thì không mua được; 💵 thì mua được.
test("chọn cách trả tiền ở chợ: chuyển khoản / tiền mặt", async ({ page }) => {
  await register(page, "Trả");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await page.getByRole("button", { name: "Ra chợ" }).tap();
  const market = page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" });
  const row = market.locator('[data-item="pate"]');
  await expect(row).toBeVisible({ timeout: 40_000 });

  await market.getByRole("button", { name: "🏦 Chuyển khoản" }).tap();
  await expect(market.locator("[data-pay]")).toHaveAttribute("data-pay", "bank");
  await expect(row.getByRole("button", { name: /^Mua/ })).toBeDisabled();
  await expect(row.getByText("Tài khoản không đủ số dư")).toBeVisible();
  await shot(page, "72-tra-bang-gi");

  const money = Number(await page.locator("[data-money]").getAttribute("data-money"));
  await market.getByRole("button", { name: "💵 Tiền mặt" }).tap();
  await row.getByRole("button", { name: /^Mua/ }).tap();
  await expect(row.getByText(/trong kho [1-9]/)).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator("[data-money]").getAttribute("data-money")))
    .toBeLessThan(money);
});
