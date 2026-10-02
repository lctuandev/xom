import { expect, test } from "@playwright/test";
import { closeSheet, readDialogue, register, shot } from "./helpers";

// Tìm chức năng (docs/USECASES.md UC-A6): ☰ Menu lưới icon theo nhóm, mỗi icon một sheet riêng; 📌 ghim lên cột neo
// trái hoặc phải (mỗi bên tối đa 4); mở chức năng từ icon neo và từ nút "›" trong sheet.
test("☰ Menu: đủ nhóm chức năng, ghim lên cột neo, mỗi chức năng một sheet riêng", async ({
  page,
}) => {
  await register(page, "Tìm");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();

  // Màn hình chính: cột trái 4 icon, cột phải 2 icon; không còn thanh 5 mục, không neo ⚙️ riêng (cài đặt ở Menu).
  await expect(page.locator('[data-anchor-rail="left"] [data-anchor]')).toHaveCount(4);
  await expect(page.locator('[data-anchor-rail="right"] [data-anchor]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Làm ăn", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cài đặt", exact: true })).toHaveCount(0);

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

  // 📌 Ghim xoay vòng trái → phải → bỏ: Làm thuê sang phải rồi bỏ ghim; Bảng xóm ghim trái; trái đầy thì Thành tựu
  // tự sang phải; hai bên đều đủ 4 thì bị từ chối.
  await menu.getByRole("button", { name: /Ghim/ }).tap();
  const jobs = menu.locator('[data-feature="jobs"]');
  await jobs.tap();
  await expect(jobs).toHaveAttribute("data-pin", "right");
  await jobs.tap();
  await expect(jobs).not.toHaveAttribute("data-pin");
  await menu.locator('[data-feature="board"]').tap();
  await expect(menu.locator('[data-feature="board"]')).toHaveAttribute("data-pin", "left");
  await menu.locator('[data-feature="badges"]').tap();
  await expect(menu.locator('[data-feature="badges"]')).toHaveAttribute("data-pin", "right");
  await menu.locator('[data-feature="skills"]').tap();
  await menu.locator('[data-feature="story"]').tap();
  await expect(page.getByText(/Mỗi bên chỉ ghim được 4 icon/).first()).toBeVisible();
  await menu.getByRole("button", { name: /Xong/ }).tap();
  await menu.getByRole("button", { name: "Đóng" }).first().tap();
  await expect(page.locator('[data-anchor-rail="left"] [data-anchor="board"]')).toBeVisible();
  await expect(page.locator('[data-anchor-rail="right"] [data-anchor="badges"]')).toBeVisible();
  await expect(page.locator('[data-anchor="jobs"]')).toHaveCount(0);
  await shot(page, "131-cot-neo");

  // Mở từ icon neo: Bảng xóm là sheet riêng.
  await page.locator('[data-anchor="board"]').tap();
  const board = page.getByRole("dialog", { name: "Bảng xóm" });
  await expect(board).toBeVisible();
  await board.getByRole("button", { name: "Đóng" }).last().tap();
  await expect(board).toHaveCount(0);

  // Hồ sơ → nút "›" sang Kỹ năng: mỗi phần là một sheet riêng, không còn tab trộn.
  await page.getByRole("button", { name: "Hồ sơ" }).tap();
  await page.getByRole("button", { name: /📈 Kỹ năng ›/ }).tap();
  const skills = page.getByRole("dialog", { name: "📈 Kỹ năng" });
  await expect(skills).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  // ‹ Quay lại về Hồ sơ (sheet mở từ sheet khác có nút quay lại; mở thẳng từ bản đồ thì không).
  await skills.getByRole("button", { name: "Quay lại" }).tap();
  const profile = page.getByRole("dialog", { name: "Tìm" });
  await expect(profile).toBeVisible();
  await expect(profile.getByRole("button", { name: "Quay lại" })).toHaveCount(0);
  // Từ Menu vào chức năng → quay lại về Menu.
  await closeSheet(page);
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  await page.locator('[data-feature="today"]').tap();
  await page
    .getByRole("dialog", { name: /Hôm nay/ })
    .getByRole("button", { name: "Quay lại" })
    .tap();
  await expect(page.getByRole("dialog", { name: "☰ Menu" })).toBeVisible();

  // Ghim lưu lại khi tải lại trang.
  await page.reload();
  await expect(page.locator('[data-anchor="board"]')).toBeVisible({ timeout: 20_000 });
});
