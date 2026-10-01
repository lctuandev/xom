import { expect, test } from "@playwright/test";
import { grantMoney, readDialogue, register, shot } from "./helpers";

// Sạp đồ ăn theo giờ (docs/USECASES.md UC-B9, B10) + đói / khát (UC-B11): bụng đói thì HUD nhắc 🍚,
// chạm vào mở danh sách quán ăn; sáng ra sạp xôi mua ăn, ngồi ghế nhựa ăn → no lại, chip đói biến mất.
test("đói bụng: sáng ra sạp xôi mua ăn, ngồi ghế nhựa ăn, no lại", async ({ page }) => {
  await register(page, "Sáng");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await grantMoney(page, undefined, undefined, { food: 20 });
  const chip = page.locator("[data-needs]");
  await expect(chip).toContainText("🍚20%");
  await shot(page, "39-doi-bung");
  await chip.tap();
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
  // Xôi gà no thêm 55 → không còn đói, chip biến mất (HUD gọn).
  await expect(chip).toHaveCount(0);
  await page.waitForTimeout(1500);
  await shot(page, "41-ngoi-an");
});
