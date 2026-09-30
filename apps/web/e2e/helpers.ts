import { expect, type Page } from "@playwright/test";

export async function register(page: Page, name = "Tuấn") {
  await page.goto("/play");
  await page.waitForURL("**/dang-nhap**");
  await page
    .getByLabel("Tên đăng nhập")
    .fill(`e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`);
  await page.getByLabel("Tên hiển thị trong xóm").fill(name);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: /Tạo tài khoản & vào xóm/ }).tap();
  await page.waitForURL("**/play");
}

/** Đọc hết lời thoại của NPC (bấm Tiếp) rồi trả về hộp thoại. */
export async function readDialogue(page: Page, speaker = "Chú Bảy xe ôm") {
  const box = page.getByRole("dialog", { name: speaker });
  await expect(box).toBeVisible();
  while (await box.getByRole("button", { name: "Tiếp ›" }).isVisible()) {
    await box.getByRole("button", { name: "Tiếp ›" }).tap();
  }
  return box;
}

/** Bấm "Đi tới" ở dòng nhiệm vụ và chờ tới nơi (nút hành động của địa điểm hiện ra). */
export async function walkToObjective(page: Page, arrivedButton: RegExp) {
  await page.getByRole("button", { name: "🚶 Đi tới" }).tap();
  await expect(page.getByRole("button", { name: arrivedButton })).toBeVisible({ timeout: 30_000 });
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/.results/${test_info_project(page)}-${name}.png` });
}

function test_info_project(page: Page) {
  return (page.viewportSize()?.width ?? 0) === 402 ? "iphone" : "pixel";
}
