import { expect, test } from "@playwright/test";
import { shot } from "./helpers";

// Hướng dẫn thêm XÓM vào màn hình chính (PWA) ở trang chủ (docs/USECASES.md UC-A5).
test("trang chủ: hướng dẫn thêm vào màn hình chính theo từng bước (iOS ảnh khoanh vùng, Android)", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Thêm XÓM vào màn hình chính/ }).tap();
  const modal = page.getByRole("dialog", { name: "Cài XÓM như ứng dụng" });
  await expect(modal).toBeVisible();
  // Tự nhận loại máy.
  const ios = info.project.name.includes("iphone");
  await expect(modal.getByRole("tab", { name: ios ? /iPhone/ : /Android/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await modal.getByRole("tab", { name: /iPhone/ }).tap();
  await expect(modal.getByText(/Bước 1\/3 · Bấm nút Chia sẻ/)).toBeVisible();
  await expect(modal.getByRole("img", { name: /Bước 1/ })).toBeVisible();
  await shot(page, "01-cai-dat-b1");
  await modal.getByRole("button", { name: "Tiếp →" }).tap();
  await expect(modal.getByText(/Bước 2\/3 · Kéo lên rồi bấm “Xem thêm”/)).toBeVisible();
  await modal.getByRole("button", { name: "Tiếp →" }).tap();
  await expect(modal.getByText(/Bước 3\/3 · Chọn “Thêm vào Màn hình chính”/)).toBeVisible();
  await shot(page, "02-cai-dat-b3");

  await modal.getByRole("tab", { name: /Android/ }).tap();
  await expect(modal.locator('[data-install="android"]')).toContainText(
    "Bấm ⋮ ở góc trên bên phải",
  );
  await modal.getByRole("tab", { name: /iPhone/ }).tap();
  await modal.getByRole("button", { name: "Xong 👍" }).tap();
  await expect(modal).toHaveCount(0);
});
