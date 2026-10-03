import { expect, test } from "@playwright/test";
import {
  openBanhMiStall,
  openFeature,
  register,
  serveCustomer,
  shot,
  waitForMorning,
} from "./helpers";

// Bảng xóm + số liệu 7 ngày + thành tựu (docs/USECASES.md UC-P2): bán món đầu tiên → thành tựu "Mở hàng";
// bảng Làm ăn có biểu đồ 7 ngày; bảng xóm có giải tuần (mình đứng đầu doanh thu), thị phần, đang hot.
test("bán món đầu tiên: thành tựu, biểu đồ 7 ngày, bảng xóm", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Hạng");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  await serveCustomer(page);

  await openFeature(page, "books");
  const sheet = page.getByRole("dialog", { name: "📊 Sổ sách" });
  // Sổ thu chi hôm nay: có bán hàng, nhập hàng, tiền chỗ; lãi/lỗ ròng.
  const books = sheet.locator("[data-books=today]");
  await expect(books).toContainText("💰 Bán hàng");
  await expect(books.locator("[data-cost=stock]")).not.toContainText("—");
  await expect(books.locator("[data-profit]")).toBeVisible();
  // Sổ theo cửa hàng đang quản lý (mặc định) hoặc tất cả (góp ý đợt 4).
  await expect(sheet.locator('[data-books-scope="shop"]')).toHaveAttribute("aria-pressed", "true");
  await sheet.locator('[data-books-scope="all"]').tap();
  await expect(books.locator("[data-profit]")).toBeVisible();
  await sheet.locator('[data-books-scope="shop"]').tap();
  await shot(page, "89-so-sach");
  const week = sheet.locator("[data-week]");
  await week.scrollIntoViewIfNeeded();
  await expect(week).toBeVisible();
  await expect(week.getByText(/^\d+k$/).first()).toBeVisible();
  await shot(page, "90-bieu-do-7-ngay");
  await sheet.getByRole("button", { name: "Đóng" }).first().tap();
  await expect(sheet).toHaveCount(0);

  await openFeature(page, "badges");
  const badge = page.locator('[data-achievement="mo_hang"]');
  await badge.scrollIntoViewIfNeeded();
  await expect(badge).toHaveAttribute("data-done", "true");
  await shot(page, "91-thanh-tuu");
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Bảng xóm: ☰ Menu → 🏆 Bảng xóm.
  await openFeature(page, "board");
  const board = page.getByRole("dialog", { name: "Bảng xóm" });
  // Bục vinh danh: mình đứng hạng 1 (giữa, khung vàng, vương miện).
  await expect(
    board.locator('[data-award="doanh_nhan"] [data-rank="1"]').getByText("Hạng (bạn)"),
  ).toBeVisible();
  await shot(page, "92-bang-xom");
  await board.getByRole("tab", { name: "📊 Thị phần" }).tap();
  await expect(board.locator('[data-share="banh_mi"]').getByText("100%")).toBeVisible();
  await board.getByRole("tab", { name: "🔥 Đang hot" }).tap();
  await expect(board.locator("[data-trends] li").first()).toBeVisible();
  await shot(page, "93-dang-hot");
});
