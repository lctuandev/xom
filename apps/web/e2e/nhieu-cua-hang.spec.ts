import { expect, test } from "@playwright/test";
import { content } from "@xom/content";
import { grantMoney, openBanhMiStall, openFeature, register, setClock, shot } from "./helpers";

// Nhiều cửa hàng + kho riêng (docs/USECASES.md UC-F14, docs/IA.md bước D): đang có xe bánh mì → ra vựa Ông Sáu
// "🏪 Mở thêm cửa hàng" trà sữa (không thay xe bánh mì) → 🏬 Các cửa hàng có 2 → quản lý lại quầy bánh mì → 📦 Kho
// chuyển hàng sang quầy trà sữa, hàng tới sau vài phút game.
test("mở thêm cửa hàng, chọn cửa hàng để quản lý, chuyển kho có thời gian", async ({ page }) => {
  test.setTimeout(360_000);
  await register(page, "Chủ chuỗi");
  await openBanhMiStall(page);
  await grantMoney(page, 2_000_000);
  await setClock(page, 8 * 60);

  // Đóng quầy bánh mì rồi ra vựa xe mở thêm cửa hàng trà sữa.
  await openFeature(page, "stall");
  await page.getByRole("button", { name: "Đóng quầy" }).tap();
  await openFeature(page, "equipment");
  const yard = page.getByRole("dialog", { name: "Vựa xe Ông Sáu" });
  await expect(yard).toBeVisible({ timeout: 60_000 });
  const tea = yard.getByRole("listitem").filter({ hasText: content.equipment("xe_tra_sua").name });
  await tea.getByRole("button", { name: /Mở thêm cửa hàng/ }).tap();
  await expect(yard).toHaveCount(0);

  // 🏬 Các cửa hàng: 2 cửa hàng, trà sữa đang quản lý.
  await openFeature(page, "shops");
  const list = page.getByRole("dialog", { name: "🏬 Các cửa hàng" });
  await expect(list.locator("[data-shop-card]")).toHaveCount(2);
  await shot(page, "140-cac-cua-hang");
  const banhMi = list.locator("[data-shop-card]").filter({ hasText: "Bánh mì" });
  await banhMi.getByRole("button", { name: /Quản lý cửa hàng này/ }).tap();
  await expect(page.getByRole("dialog", { name: "🏪 Quầy của tôi" })).toBeVisible();

  // 📦 Kho quầy bánh mì: có thanh chọn cửa hàng + chuyển 1 phần sang quầy trà sữa.
  await openFeature(page, "stock");
  const stock = page.getByRole("dialog", { name: "📦 Kho hàng" });
  await expect(stock.getByRole("navigation", { name: "Chọn cửa hàng" })).toBeVisible();
  const box = stock.locator("[data-transfer]");
  await box.scrollIntoViewIfNeeded();
  await box.getByRole("button", { name: /🚚 Chuyển 1 phần/ }).tap();
  await expect(page.getByText(/🚚 Đang chở 1/).first()).toBeVisible();
  await shot(page, "141-chuyen-kho");

  // Sau thời gian chở: hàng tới cửa hàng nhận.
  await setClock(page, 8 * 60 + 30 + content.economy.transferMinutes);
  await expect(page.getByText("📦 Hàng chuyển kho đã tới cửa hàng").first()).toBeVisible({
    timeout: 30_000,
  });
});
