import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Tìm chức năng (docs/USECASES.md UC-A6): ☰ Menu lưới icon theo nhóm, mỗi icon một sheet riêng; 📌 ghim tối đa 4 lên
// cột neo trái; mở chức năng từ icon neo và từ nút "›" trong sheet.
test("☰ Menu: đủ nhóm chức năng, ghim lên cột neo, mỗi chức năng một sheet riêng", async ({
  page,
}) => {
  await register(page, "Tìm");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();

  // Màn hình chính: cột neo mặc định 4 icon, không còn thanh 5 mục.
  const rail = page.locator("[data-anchor-rail] [data-anchor]");
  await expect(rail).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Làm ăn", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  const menu = page.getByRole("dialog", { name: "☰ Menu" });
  for (const group of ["Cửa hàng", "Mua bán", "Việc làm", "Xóm", "Tôi"])
    await expect(menu.getByRole("region", { name: group })).toBeVisible();
  // Chưa có xe hàng: Vựa xe có chấm đỏ.
  await expect(menu.locator('[data-feature="equipment"]')).toHaveAttribute(
    "title",
    /Chưa có xe hàng/,
  );
  await shot(page, "130-menu");

  // 📌 Ghim: bỏ Làm thuê, ghim Bảng xóm; ghim thêm khi đã đủ 4 thì bị từ chối.
  await menu.getByRole("button", { name: /Ghim/ }).tap();
  await menu.locator('[data-feature="jobs"]').tap();
  await menu.locator('[data-feature="board"]').tap();
  await menu.locator('[data-feature="badges"]').tap();
  await expect(page.getByText(/Chỉ ghim được 4 icon/).first()).toBeVisible();
  await menu.getByRole("button", { name: /Xong/ }).tap();
  await menu.getByRole("button", { name: "Đóng" }).first().tap();
  await expect(page.locator('[data-anchor="board"]')).toBeVisible();
  await expect(page.locator('[data-anchor="jobs"]')).toHaveCount(0);
  await shot(page, "131-cot-neo");

  // Mở từ icon neo: Bảng xóm là sheet riêng.
  await page.locator('[data-anchor="board"]').tap();
  await expect(page.getByRole("dialog", { name: "Bảng xóm" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().tap();

  // Hồ sơ → nút "›" sang Kỹ năng: mỗi phần là một sheet riêng, không còn tab trộn.
  await page.getByRole("button", { name: "Hồ sơ" }).tap();
  await page.getByRole("button", { name: /📈 Kỹ năng ›/ }).tap();
  await expect(page.getByRole("dialog", { name: "📈 Kỹ năng" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);

  // Ghim lưu lại khi tải lại trang.
  await page.reload();
  await expect(page.locator('[data-anchor="board"]')).toBeVisible({ timeout: 20_000 });
});
