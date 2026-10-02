import { expect, test } from "@playwright/test";
import {
  closeSheet,
  grantMoney,
  openBanhMiStall,
  openFeature,
  register,
  serveCustomer,
  shot,
  waitForMorning,
} from "./helpers";

// Sự kiện do người chơi tạo (docs/USECASES.md UC-B5, DESIGN §9): khai trương quầy — trả tiền pháo, bong bóng, băng rôn;
// quầy đông khách hơn, giảm giá vài giờ; cả xóm thấy tin.
test("khai trương quầy bánh mì: trả tiền, bong bóng, khách đông, giá khai trương", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await register(page, "Khai");
  await waitForMorning(page, 12);
  await openBanhMiStall(page);
  // Bán vài ngày mới đủ vốn khai trương — kịch bản cộng sẵn (lệnh thử của bản dev).
  // Khai trương mở ở cấp 2 (Luật 4.2) — cộng sẵn KN.
  await grantMoney(page, 200_000, 150);

  await openFeature(page, "promo");
  const sheet = page.getByRole("dialog", { name: "🎉 Khai trương" });
  const host = sheet.getByRole("button", { name: /🎉 Khai trương · 100\.000đ/ });
  await host.scrollIntoViewIfNeeded();
  await expect(host).toBeEnabled();
  await host.tap();
  await expect(sheet.locator('[data-promo="on"]')).toBeVisible();
  await expect(sheet.getByText(/Đang khai trương tới/)).toBeVisible();
  await shot(page, "60-khai-truong");
  await closeSheet(page);
  await expect(page.getByText(/khai trương ở Đầu hẻm 12/).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "61-bong-bong");

  // Khách tới sau lúc khai trương trả giá khai trương (khách xếp hàng từ trước thì vẫn giá cũ).
  let promo = false;
  for (let i = 0; i < 4 && !promo; i++) {
    await serveCustomer(page, async (kitchen) => {
      promo = await kitchen.getByText("🎉 giá khai trương").isVisible();
    });
  }
  expect(promo).toBe(true);
});
