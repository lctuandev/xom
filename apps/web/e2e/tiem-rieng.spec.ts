import { expect, test } from "@playwright/test";
import { makeDish, openBanhMiStall, payOrder, register, shot, waitForMorning } from "./helpers";

// Tiệm riêng (docs/USECASES.md UC-W6): thuê nhà mặt tiền, mở tiệm, vào trong tiệm đứng quầy;
// khách đi từ cửa vào gọi món, mình làm món, tính tiền.
test("thuê nhà mặt tiền mở tiệm: khách vào tiệm gọi món, làm món trong tiệm", async ({ page }) => {
  test.setTimeout(480_000);
  await register(page, "Tiệm");
  await waitForMorning(page, 9);
  await openBanhMiStall(page, /Nhà mặt tiền số 10/);
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
