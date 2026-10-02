import { expect, test } from "@playwright/test";
import { openBanhMiStall, openFeature, register, shot } from "./helpers";

// Bản sắc khu phố (docs/THEGIOI.md §3, docs/USECASES.md UC-M3): chỗ bán ghi rõ khu nào, hợp hàng gì; Bảng xóm → 🏙️ Khu phố
// đếm quầy đang mở theo khu. Khu tụ đủ quầy cùng nhóm thì "đang thành khu ăn uống" (công thức: sim economy.test.ts).
test("khu phố: chỗ bán ghi khu + hợp hàng gì; bảng xóm đếm quầy theo khu", async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, "Khu");
  await openBanhMiStall(page);

  await openFeature(page, "board");
  const board = page.getByRole("dialog", { name: "Bảng xóm" });
  await board.getByRole("tab", { name: "🏙️ Khu phố" }).tap();
  const hem = board.locator('[data-district="residential"]');
  await expect(hem).toContainText("🏘️ Trong hẻm");
  await expect(hem).toContainText("1 quầy đang mở");
  await expect(hem).toContainText("hợp sửa xe");
  await expect(board.locator('[data-district="school"]')).toContainText("hợp phụ kiện, trà sữa");
  await shot(page, "84-khu-pho");
  await board.getByRole("button", { name: "Đóng" }).last().tap();

  // Chỗ bán đang dùng ghi rõ khu + khu hợp hàng gì (danh sách đổi chỗ cũng vậy).
  await openFeature(page, "lot");
  await expect(page.locator('[data-district="residential"]').first()).toContainText(
    "🏘️ Trong hẻm · hợp sửa xe",
  );
});
