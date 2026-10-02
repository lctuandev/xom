import { expect, test } from "@playwright/test";
import { openBanhMiStall, register, setClock, shot } from "./helpers";

// Mở tiệm theo quy trình đời thật (docs/USECASES.md UC-F12): Làm ăn → 🏪 Mở tiệm → ký hợp đồng thuê nhà (cọc) → đặt tên quán,
// nộp hồ sơ hộ kinh doanh → tập huấn ATTP → hẹn đoàn kiểm tra, về tiệm đón đoàn → làm biển hiệu → mở tiệm.
test("mở tiệm: thuê nhà, hộ kinh doanh, ATTP, biển hiệu rồi khai trương", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Chủ tiệm");
  await openBanhMiStall(page);
  await setClock(page, 7 * 60);

  const biz = () => page.getByRole("button", { name: "Làm ăn", exact: true }).tap();
  const tab = async () => {
    await biz();
    await page.getByRole("tab", { name: "🏪 Mở tiệm" }).tap();
    return page.getByRole("region", { name: "Mở tiệm" });
  };
  // Đang bán ở xe đẩy: đóng quầy trước khi dọn sang nhà.
  await biz();
  await page.getByRole("button", { name: "Đóng quầy" }).tap();
  await page.getByRole("tab", { name: "🏪 Mở tiệm" }).tap();
  const shop = page.getByRole("region", { name: "Mở tiệm" });
  await expect(shop).toHaveAttribute("data-shop-step", "lease");
  await shot(page, "100-mo-tiem-du-toan");
  await shop
    .locator("[data-house=nha_so_10]")
    .getByRole("button", { name: /Ký hợp đồng/ })
    .tap();
  await expect(shop.locator("[data-lease=nha_so_10]")).toBeVisible();

  // Đăng ký hộ kinh doanh: đặt tên quán.
  await shop.getByLabel(/Tên quán/).fill("Bánh Mì Cô Tấm");
  await shop.getByRole("button", { name: /Nộp hồ sơ/ }).tap();
  await expect(shop).toContainText("đang xét hồ sơ");
  await setClock(page, 10 * 60 + 30);
  await expect(page.getByText(/🏛️ UBND phường duyệt hồ sơ/).first()).toBeVisible({
    timeout: 30_000,
  });

  // ATTP: tập huấn → hẹn đoàn → về tiệm đón.
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().tap();
  let s = await tab();
  await s.getByRole("button", { name: /Đi tập huấn ATTP/ }).tap();
  await s.getByRole("button", { name: "Hẹn đoàn kiểm tra tới tiệm" }).tap();
  const when = (await s.locator("[data-inspect]").textContent()) ?? "";
  const [, hh, mm] = when.match(/(\d{1,2}):(\d{2})/) ?? [];
  await s.getByRole("button", { name: "🚶 Về tiệm" }).tap();
  await expect(page.getByRole("button", { name: "🏪 Vào tiệm" })).toBeVisible({ timeout: 60_000 });
  await setClock(page, Number(hh) * 60 + Number(mm) + 1);
  await expect(page.getByText(/👮 Đoàn kiểm tra ATTP tới tiệm/).first()).toBeVisible({
    timeout: 30_000,
  });
  s = await tab();
  await s.getByRole("button", { name: "👮 Đón đoàn" }).tap();
  await expect(page.getByText(/cấp giấy chứng nhận ATTP/).first()).toBeVisible();

  // Biển hiệu tên quán → đủ giấy tờ → mở tiệm.
  await s.getByRole("button", { name: /Làm biển "Bánh Mì Cô Tấm"/ }).tap();
  await expect(s.locator("[data-shop-ready]")).toBeVisible();
  await shot(page, "101-du-giay-to");
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().tap();
  await page.getByRole("button", { name: /🔓 Mở tiệm/ }).tap();
  await expect(page.getByRole("button", { name: /🔓 Mở tiệm/ })).toHaveCount(0);
  await page.waitForTimeout(1500);
  await shot(page, "102-bien-hieu");
});
