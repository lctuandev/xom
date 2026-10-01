import { expect, test } from "@playwright/test";
import { giveChange, readDialogue, register, setClock, setWeather, shot } from "./helpers";

// Xe ôm (docs/KIENTRUC.md §4, docs/USECASES.md UC-N1): Việc làm → 🛵 Chạy xe ôm → tới trạm gốc me → thuê xe → chờ khách →
// báo giá chuẩn → chọn đường lớn → chạy tới nơi → thu tiền (thối nếu cần) → khách chấm sao, trừ xăng.
test("chạy một cuốc xe ôm: thuê xe, đón khách, trả giá, chọn đường, tới nơi, thu tiền", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await register(page, "Xe ôm");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await setClock(page, 13 * 60);
  await setWeather(page, "sunny");

  await page.getByRole("button", { name: "Việc làm" }).tap();
  await page
    .locator("[data-job=xe_om]")
    .getByRole("button", { name: /Đi tới Trạm xe ôm gốc me/ })
    .tap();
  const sheet = page.getByRole("dialog", { name: "Trạm xe ôm gốc me" });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await sheet.getByRole("button", { name: /Thuê xe · 30k/ }).tap();
  await expect(sheet.locator("[data-jam]")).toBeVisible();
  await shot(page, "95-tram-xe-om");
  await sheet.getByRole("button", { name: "🙋 Đứng chờ khách" }).tap();

  // Khách tới hỏi giá.
  await expect(sheet.locator("[data-passenger]")).toBeVisible({ timeout: 60_000 });
  await shot(page, "96-khach-hoi-gia");
  await sheet.getByRole("button", { name: /^Giá chuẩn/ }).tap();
  await expect(sheet.locator("[data-ride=route]")).toBeVisible();
  await sheet.getByRole("button", { name: /Đường lớn/ }).tap();

  // Chạy tới nơi: tới nơi thì sheet trạm tự mở lại ở bước đang chở.
  await expect(sheet.locator("[data-ride=riding]")).toBeVisible({ timeout: 60_000 });
  await sheet.getByRole("button", { name: "🛬 Tới nơi rồi" }).tap();
  await expect(sheet.locator("[data-ride=pay]")).toBeVisible();
  await shot(page, "97-toi-noi");
  const received = sheet.getByRole("button", { name: "✓ Đã nhận tiền" });
  if (await received.isVisible()) await received.tap();
  else await giveChange(page, sheet);

  await expect(page.getByText(/🛵 ⭐/).first()).toBeVisible();
  await expect(sheet.locator("[data-ride-stats]")).toContainText("1 cuốc");
  await shot(page, "98-xong-cuoc");
});
