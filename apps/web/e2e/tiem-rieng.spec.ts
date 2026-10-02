import { expect, test } from "@playwright/test";
import {
  grantMoney,
  makeDish,
  openBanhMiStall,
  openFeature,
  payOrder,
  register,
  shot,
  waitForMorning,
} from "./helpers";

// Tiệm riêng (docs/USECASES.md UC-W6): thuê nhà mặt tiền, mở tiệm, vào trong tiệm đứng quầy;
// khách đi từ cửa vào gọi món, mình làm món, tính tiền.
test("thuê nhà mặt tiền mở tiệm: khách vào tiệm gọi món, làm món trong tiệm", async ({ page }) => {
  test.setTimeout(480_000);
  await register(page, "Tiệm");
  await waitForMorning(page, 9);
  // Thuê nhà mặt tiền + thuế khoán đắt hơn xe đẩy (UC-I7): kịch bản cộng sẵn vốn.
  await grantMoney(page, 100_000);
  await openBanhMiStall(page);
  // Giấy tờ mở tiệm (UC-F12) có kịch bản riêng (mo-tiem): ở đây đóng xe đẩy, thuê nhà + đủ giấy tờ bằng lệnh dev.
  await openFeature(page, "stall");
  await page.getByRole("button", { name: "Đóng quầy" }).tap();
  const ok = await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
      }
    ).xomDebug;
    return (await dbg?.send("debug:shop", { lotId: "nha_so_10" }))?.ok ?? false;
  });
  expect(ok).toBe(true);
  await page.getByRole("button", { name: /Đẩy xe tới 🏠 Nhà mặt tiền số 10/ }).tap();
  // Tới nơi: sheet Làm ăn tự mở — đóng lại, bấm "🔓 Mở tiệm" (chỉ hiện khi đã đứng ở tiệm) rồi chờ tiệm mở thật.
  await expect(page.getByRole("button", { name: "Mở quầy bán" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().tap();
  await page.getByRole("button", { name: /🔓 Mở tiệm/ }).tap();
  await expect(page.getByRole("button", { name: /🔓 Mở tiệm/ })).toHaveCount(0);
  await page.getByRole("button", { name: "🏪 Vào tiệm" }).tap();
  const panel = page.getByRole("region", { name: "Tiệm của tôi" });
  await expect(panel).toBeVisible();
  const cook = panel.getByRole("button", { name: /Làm món cho khách/ });
  await expect(cook).toBeEnabled({ timeout: 90_000 });
  await page.waitForTimeout(2500);
  await shot(page, "50-tiem");
  await cook.tap();
  await makeDish(page);
  await payOrder(page);
  await expect(page.getByRole("dialog", { name: "Làm món" })).toHaveCount(0);
});
