import { expect, test } from "@playwright/test";
import { openBanhMiStall, register, serveCustomer, shot, waitForMorning } from "./helpers";

// Bảng xóm + số liệu 7 ngày + thành tựu (docs/USECASES.md UC-P2): bán món đầu tiên → thành tựu "Mở hàng";
// bảng Làm ăn có biểu đồ 7 ngày; bảng xóm có giải tuần (mình đứng đầu doanh thu), thị phần, đang hot.
test("bán món đầu tiên: thành tựu, biểu đồ 7 ngày, bảng xóm", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Hạng");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  await serveCustomer(page);

  await page.getByRole("button", { name: "Làm ăn", exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: /Xe bánh mì kính/ });
  await sheet.getByRole("tab", { name: "📊 Số liệu" }).tap();
  const week = sheet.locator("[data-week]");
  await week.scrollIntoViewIfNeeded();
  await expect(week).toBeVisible();
  await expect(week.getByText(/^\d+k$/).first()).toBeVisible();
  await shot(page, "90-bieu-do-7-ngay");
  await sheet.getByRole("button", { name: "Đóng" }).first().tap();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: "Hồ sơ" }).tap();
  await page.getByRole("tab", { name: /🏅 Thành tựu/ }).tap();
  const badge = page.locator('[data-achievement="mo_hang"]');
  await badge.scrollIntoViewIfNeeded();
  await expect(badge).toHaveAttribute("data-done", "true");
  await shot(page, "91-thanh-tuu");
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /^Hàng xóm:/ }).tap();
  await page.getByRole("button", { name: /🏆 Bảng xóm/ }).tap();
  const board = page.getByRole("dialog", { name: "Bảng xóm" });
  await expect(board.locator('[data-award="doanh_nhan"]').getByText("Hạng (bạn)")).toBeVisible();
  await shot(page, "92-bang-xom");
  await board.getByRole("tab", { name: "📊 Thị phần" }).tap();
  await expect(board.locator('[data-share="banh_mi"]').getByText("100%")).toBeVisible();
  await board.getByRole("tab", { name: "🔥 Đang hot" }).tap();
  await expect(board.locator("[data-trends] li").first()).toBeVisible();
  await shot(page, "93-dang-hot");
});
