import { expect, type Page, test } from "@playwright/test";
import {
  giveChange,
  openFeature,
  readDialogue,
  register,
  setClock,
  setWeather,
  shot,
} from "./helpers";

// Xe ôm (docs/KIENTRUC.md §4, docs/USECASES.md UC-N1): Việc làm → 🛵 Chạy xe ôm → tới trạm gốc me → thuê xe (xe hiện dưới
// người) → chạy ra đường lớn giữa xóm, đậu xe chờ khách ở đó → khách vẫy: thông báo bấm được → báo giá chuẩn → chọn
// đường lớn → chở khách (khách ngồi sau) tới nơi → thu tiền (thối nếu cần) → khách chấm sao, trừ xăng.
const rider = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        xomRider: () => { x: number; z: number; bike: boolean; passenger: string };
      }
    ).xomRider(),
  );

test("chạy một cuốc xe ôm: thuê xe, đón khách, trả giá, chọn đường, tới nơi, thu tiền", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await register(page, "Xe ôm");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await setClock(page, 13 * 60);
  await setWeather(page, "sunny");

  // ☰ Menu → 🛵 Xe ôm: chưa thuê xe thì tự đi tới trạm.
  await openFeature(page, "ride");
  const sheet = page.getByRole("dialog", { name: "Trạm xe ôm gốc me" });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await sheet.getByRole("button", { name: /Thuê xe · 30k/ }).tap();
  // Thuê xong: bảng thành "Chạy xe ôm" (không gắn với trạm nữa).
  const rideSheet = page.getByRole("dialog", { name: "🛵 Chạy xe ôm" });
  await expect(rideSheet.locator("[data-jam]")).toBeVisible();
  await shot(page, "95-tram-xe-om");
  await rideSheet.getByRole("button", { name: "Đóng" }).first().tap();

  // Đã thuê xe: xe hiện dưới người, chạy ra đường lớn giữa xóm (xa trạm) đậu chờ khách.
  await expect(page.locator("canvas")).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { xomDebug: { walk: (x: number, z: number) => void } }).xomDebug.walk(
      8,
      0,
    ),
  );
  const chip = page.locator("[data-ride-chip=idle]");
  await expect(chip).toBeVisible();
  await expect.poll(() => rider(page).then((r) => r.bike)).toBe(true);
  await expect.poll(() => rider(page).then((r) => r.x), { timeout: 30_000 }).toBeGreaterThan(6);
  await shot(page, "95b-xe-duoi-nguoi");
  await chip.tap();
  await rideSheet.getByRole("button", { name: "🙋 Đậu xe ở đây chờ khách" }).tap();
  await rideSheet.getByRole("button", { name: "Đóng" }).first().tap();
  await expect(page.locator("[data-ride-chip=waiting]")).toBeVisible();

  // Khách vẫy: thông báo bấm được (hoặc chip đỏ) → mở bảng trả giá.
  const hail = page.locator("[data-toast-open=ride]").first();
  await expect(page.locator("[data-ride-chip=offer]")).toBeVisible({ timeout: 60_000 });
  await shot(page, "96a-khach-vay");
  if (await hail.isVisible()) await hail.tap();
  else await page.locator("[data-ride-chip=offer]").tap();
  await expect(rideSheet.locator("[data-passenger]")).toBeVisible();
  await shot(page, "96-khach-hoi-gia");
  await rideSheet.getByRole("button", { name: /^Giá chuẩn/ }).tap();
  await expect(rideSheet.locator("[data-ride=route]")).toBeVisible();
  await rideSheet.getByRole("button", { name: /Đường lớn/ }).tap();
  // Đang chở: khách ngồi sau xe.
  await expect(page.locator("[data-ride-chip=riding]")).toBeVisible();
  await expect.poll(() => rider(page).then((r) => r.passenger)).not.toBe("");
  await page.waitForTimeout(1500);
  await shot(page, "96b-cho-khach");

  // Chạy tới nơi: tới nơi thì sheet trạm tự mở lại ở bước đang chở.
  await expect(rideSheet.locator("[data-ride=riding]")).toBeVisible({ timeout: 60_000 });
  await rideSheet.getByRole("button", { name: "🛬 Tới nơi rồi" }).tap();
  await expect(rideSheet.locator("[data-ride=pay]")).toBeVisible();
  await shot(page, "97-toi-noi");
  const received = rideSheet.getByRole("button", { name: "✓ Đã nhận tiền" });
  if (await received.isVisible()) await received.tap();
  else await giveChange(page, rideSheet);

  await expect(page.getByText(/🛵 ⭐/).first()).toBeVisible();
  await expect(rideSheet.locator("[data-ride-stats]")).toContainText("1 cuốc");
  await shot(page, "98-xong-cuoc");
});
