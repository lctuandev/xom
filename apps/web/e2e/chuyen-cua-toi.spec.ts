import { expect, test } from "@playwright/test";
import { openBanhMiStall, register, serveCustomer, shot } from "./helpers";

// Chuyện của tôi (docs/THEGIOI.md §1, docs/USECASES.md UC-M1): mỗi mốc đời người chơi được ghi lại đúng ngày —
// dọn về xóm với bao nhiêu tiền, mua xe, mở quầy đầu tiên, bán món đầu tiên. Hồ sơ → tab 📖 Chuyện.
test("chuyện của tôi: dọn về xóm → mua xe → mở quầy → bán món đầu tiên", async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, "Kể");
  await openBanhMiStall(page);
  // Mở quầy lần đầu: báo 📖 ngay.
  await expect(page.getByText(/📖 🎪 Mở quầy bánh mì đầu tiên ở Đầu hẻm 12/).first()).toBeVisible();
  await serveCustomer(page);

  await page.getByRole("button", { name: "Hồ sơ" }).tap();
  await page.getByRole("tab", { name: "📖 Chuyện" }).tap();
  const story = page.getByRole("region", { name: "Chuyện của tôi" });
  await expect(story.getByText("Dọn về xóm với 1.500.000đ trong túi")).toBeVisible();
  await expect(story.getByText("Mua Xe bánh mì kính — bắt đầu đi buôn")).toBeVisible();
  await expect(story.getByText("Mở quầy bánh mì đầu tiên ở Đầu hẻm 12")).toBeVisible();
  await expect(story.getByText(/Bán được món đầu tiên/)).toBeVisible();
  // Thứ tự theo thời gian: dọn về xóm là dòng đầu tiên.
  await expect(story.locator("li").first()).toContainText("Dọn về xóm");
  await shot(page, "80-chuyen-cua-toi");
});
