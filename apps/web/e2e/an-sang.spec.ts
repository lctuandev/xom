import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Sạp đồ ăn theo giờ (docs/USECASES.md UC-B9, B10): sáng ra sạp xôi mua ăn, ngồi ghế nhựa ăn.
test("sáng ra sạp xôi mua ăn, ngồi ghế nhựa ăn", async ({ page }) => {
  await register(page, "Sáng");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await page.getByRole("button", { name: "Quán ăn quanh xóm" }).tap();
  const list = page.getByRole("dialog", { name: "Quán ăn quanh xóm" });
  await expect(list.getByText("Đang bày").first()).toBeVisible();
  await shot(page, "40-quan-an");
  await list.getByRole("button", { name: "Đi tới XÔI BÀ BẢY" }).tap();
  // Tới nơi thì bảng của sạp tự mở.
  const sap = page.getByRole("dialog", { name: "XÔI BÀ BẢY" });
  await expect(sap).toBeVisible({ timeout: 40_000 });
  await sap.locator("li", { hasText: "Xôi gà" }).getByRole("button", { name: "Mua" }).tap();
  await expect(page.getByText("😋 Đang ăn… ngon quá!")).toBeVisible();
  await expect(page.getByText("480.000đ").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "41-ngoi-an");
});
