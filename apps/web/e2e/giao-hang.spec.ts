import { expect, type Page, test } from "@playwright/test";
import {
  giveChange,
  openFeature,
  readDialogue,
  register,
  shot,
  skipGuide,
  waitForMorning,
} from "./helpers";

// Giao hàng bưu cục Anh Tám (docs/USECASES.md UC-W5): nhận đơn → soạn đúng gói trên kệ → ra xe
// → tới đúng nhà → gọi khách → đưa điện thoại ký nhận, kiểm người ký → thu hộ, thối tiền → về nộp tiền.

async function enterPostOffice(page: Page) {
  await page.getByRole("button", { name: "📦 Vào bưu cục · Anh Tám" }).tap();
  await expect(page.getByRole("region", { name: "Làm việc" })).toBeVisible();
}

/** Trước cửa: xử lý đúng như người giao hàng cẩn thận. Trả về false nếu khách hẹn chưa tới giờ. */
async function handleDoor(page: Page, code: string) {
  // Đợi đúng nhà của đơn đang tới (đi ngang nhà khác trong chuyến thì nút gọi của nhà đó cũng hiện).
  const call = page.getByRole("button", { name: new RegExp(`🔔 Gọi khách .*\\(${code}\\)`) });
  const sheet = page.getByRole("dialog", { name: "Giao hàng" });
  await expect(call).toBeVisible({ timeout: 30_000 });
  await call.tap();
  const sign = sheet.getByRole("button", { name: "📱 Đưa điện thoại ký nhận" });
  const absent = sheet.getByRole("button", { name: "↩︎ Hoàn về" });
  const refused = sheet.getByText(/từ chối nhận/);
  try {
    await expect(sign.or(absent).or(refused)).toBeVisible({ timeout: 5_000 });
  } catch {
    return false; // khách hẹn lát nữa
  }
  if (await absent.isVisible()) {
    await absent.tap();
    await expect(sheet).toBeHidden();
    return true;
  }
  if (await refused.isVisible()) return true;

  await shot(page, "12-truoc-cua");
  await sign.tap();
  const deliver = sheet.getByRole("button", { name: /✅ Giao hàng/ });
  await expect(deliver).toBeVisible();
  await shot(page, "13-ky-nhan");
  const recipient = (await sheet.locator("b").first().textContent()) ?? "";
  const signer = ((await sheet.getByText(/Người ra mở cửa/).textContent()) ?? "").replace(
    "Người ra mở cửa: ",
    "",
  );
  if (!signer.includes(recipient)) {
    // Người lạ ký nhận → không giao, hẹn lại.
    await sheet.getByRole("button", { name: /Không phải người nhận/ }).tap();
    return true;
  }
  await deliver.tap();
  if (await sheet.getByText(/Khách đưa tờ/).isVisible()) await giveChange(page, sheet);
  await expect(sheet).toBeHidden();
  return true;
}

test("giao hàng: soạn gói, chạy tới nhà, ký nhận, thu hộ rồi về nộp tiền", async ({ page }) => {
  test.setTimeout(540_000);
  await register(page, "Tâm");
  const box = await readDialogue(page);
  await box.getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await waitForMorning(page, 9);

  await openFeature(page, "jobs");
  await page.getByRole("button", { name: /Đi tới Bưu cục/ }).tap();
  await expect(page.getByRole("button", { name: "📦 Vào bưu cục · Anh Tám" })).toBeVisible({
    timeout: 30_000,
  });
  await enterPostOffice(page);
  await page.getByRole("button", { name: /^📦 Giao hàng/ }).tap();
  await skipGuide(page);
  await page.getByRole("button", { name: "📋 Nhận đơn giao" }).tap();

  // Soạn từng gói: đọc mã trên phiếu, tìm đúng gói trên kệ.
  const find = page.getByText(/^Tìm gói/);
  await expect(find).toBeVisible();
  while (await find.isVisible()) {
    const code = (await find.locator("span").textContent()) ?? "";
    await shot(page, "11-ke-hang");
    await page
      .getByRole("group", { name: "Kệ hàng" })
      .getByRole("button", { name: `📦 ${code}` })
      .tap();
    await expect(page.getByText(new RegExp(`^Tìm gói ${code}`))).toBeHidden();
  }
  await page.getByRole("button", { name: "🛵 Ra xe đi giao" }).tap();
  await page.getByRole("button", { name: /Chạy chậm/ }).tap();

  for (let guard = 0; guard < 12; guard++) {
    // Đợi bảng giao hàng cập nhật xong (đang xử lý trước cửa thì chưa có nút).
    const go = page.getByRole("button", { name: "🛵 Đi tới" });
    const back = page.getByRole("button", { name: "📮 Về bưu cục" });
    await expect(go.or(back)).toBeVisible({ timeout: 15_000 });
    if (!(await go.isVisible())) break;
    const code =
      (await page
        .getByText(/→ Nhà số/)
        .locator("span")
        .first()
        .textContent()) ?? "";
    await go.tap();
    if (!(await handleDoor(page, code))) await page.waitForTimeout(3_000);
  }

  await page.getByRole("button", { name: "📮 Về bưu cục" }).tap();
  await expect(page.getByRole("button", { name: "📦 Vào bưu cục · Anh Tám" })).toBeVisible({
    timeout: 30_000,
  });
  await enterPostOffice(page);
  await page.getByRole("button", { name: "💵 Nộp tiền & hàng" }).tap();
  await expect(page.getByText(/tiền chuyến|Hàng hoàn về/).first()).toBeVisible();
  await shot(page, "14-nop-tien");
});
