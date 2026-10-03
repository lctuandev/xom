import { expect, test } from "@playwright/test";
import { content } from "@xom/content";
import {
  closeSheet,
  grantMoney,
  openBanhMiStall,
  openFeature,
  register,
  setClock,
  shot,
} from "./helpers";

// Nhiều cửa hàng + kho riêng (docs/USECASES.md UC-F14, docs/IA.md bước D): đang có xe bánh mì → ra vựa Ông Sáu
// "🏪 Mở thêm cửa hàng" trà sữa (không thay xe bánh mì) → 🏬 Các cửa hàng có 2 → quản lý lại quầy bánh mì → 📦 Kho
// chuyển hàng sang quầy trà sữa, hàng tới sau vài phút game.
test("mở thêm cửa hàng, chọn cửa hàng để quản lý, chuyển kho có thời gian", async ({ page }) => {
  test.setTimeout(360_000);
  await register(page, "Chủ chuỗi");
  await openBanhMiStall(page);
  await grantMoney(page, 2_000_000);
  await setClock(page, 8 * 60);

  // Đóng quầy bánh mì rồi ra vựa xe mở thêm cửa hàng trà sữa.
  await openFeature(page, "stall");
  await page.getByRole("button", { name: /^Đóng (quầy|tiệm|sạp)$/ }).tap();
  await openFeature(page, "equipment");
  const yard = page.getByRole("dialog", { name: "Vựa xe Ông Sáu" });
  await expect(yard).toBeVisible({ timeout: 60_000 });
  const tea = yard.getByRole("listitem").filter({ hasText: content.equipment("xe_tra_sua").name });
  await tea.getByRole("button", { name: /Mở thêm cửa hàng/ }).tap();
  await expect(yard).toHaveCount(0);
  // Mở thêm cửa hàng xong thì chọn chỗ bán luôn (UC-F15).
  await expect(page.getByRole("dialog", { name: /Chỗ bán/ })).toBeVisible();

  // 🏬 Các cửa hàng: 2 cửa hàng, trà sữa đang quản lý.
  await openFeature(page, "shops");
  const list = page.getByRole("dialog", { name: "🏬 Các cửa hàng" });
  await expect(list.locator("[data-shop-card]")).toHaveCount(2);
  // Mỗi cửa hàng có doanh thu hôm nay + ⭐ riêng (góp ý đợt 4).
  await expect(list.locator("[data-shop-stats]")).toHaveCount(2);
  await expect(list.locator("[data-shop-stats]").first()).toContainText("Hôm nay");
  await shot(page, "140-cac-cua-hang");
  await closeSheet(page);

  // Đi bộ về quầy bánh mì (Đầu hẻm 12): tới quầy nào thì tự quản lý quầy đó — mở lại quầy bánh mì được ngay, không cần
  // vào 🏬 chọn lại (lỗi cũ: nhiều cửa hàng không chạy cùng lúc được).
  const lot = content.lot("dau_hem");
  const back = lot.facing === 0 ? -1 : 1;
  await page.evaluate(
    ([x, z]) =>
      (window as unknown as { xomDebug: { walk: (x: number, z: number) => void } }).xomDebug.walk(
        x,
        z,
      ),
    [lot.position.x, lot.position.z + back * 0.9],
  );
  await expect(page.getByText(/Đang ở Bánh mì — quản lý cửa hàng này/).first()).toBeVisible({
    timeout: 30_000,
  });
  await openFeature(page, "stall");
  await page
    .getByRole("button", { name: /Mở quầy/ })
    .first()
    .tap();
  await expect(page.getByRole("button", { name: /^Đóng (quầy|tiệm|sạp)$/ })).toBeVisible();

  // 📦 Kho quầy bánh mì: có thanh chọn cửa hàng + chuyển 1 phần sang quầy trà sữa.
  await openFeature(page, "stock");
  const stock = page.getByRole("dialog", { name: "📦 Kho hàng" });
  await expect(stock.getByRole("navigation", { name: "Chọn cửa hàng" })).toBeVisible();
  const box = stock.locator("[data-transfer]");
  await box.scrollIntoViewIfNeeded();
  await box.getByRole("button", { name: /🚚 Chuyển 1 phần/ }).tap();
  await expect(page.getByText(/🚚 Đang chở 1/).first()).toBeVisible();
  await shot(page, "141-chuyen-kho");

  // Sau thời gian chở: hàng tới cửa hàng nhận.
  await setClock(page, 8 * 60 + 30 + content.economy.transferMinutes);
  await expect(page.getByText("📦 Hàng chuyển kho đã tới cửa hàng").first()).toBeVisible({
    timeout: 30_000,
  });
});

// Góp ý đợt 3 — lỗi "không mở nhiều tiệm được": đang thuê nhà mặt tiền cho tiệm bánh mì thì vẫn mở thêm xe trà sữa và đặt
// ra vỉa hè được (trước đây chỗ vỉa hè bị khoá "đang thuê nhà" cho mọi cửa hàng).
test("đang thuê tiệm trong nhà vẫn mở thêm cửa hàng ngoài vỉa hè", async ({ page }) => {
  test.setTimeout(300_000);
  await register(page, "Hai tiệm");
  await openBanhMiStall(page);
  await grantMoney(page, 3_000_000);
  const send = (event: string, body: unknown) =>
    page.evaluate(
      async ([e, p]) =>
        (
          window as unknown as {
            xomDebug: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
          }
        ).xomDebug.send(e as string, p),
      [event, body] as const,
    );
  expect((await send("biz:close", {})).ok).toBe(true);
  // Tiệm bánh mì dọn vào nhà mặt tiền số 10 (thuê + giấy tờ xong — lệnh thử nghiệm).
  expect((await send("debug:shop", { lotId: "nha_so_10" })).ok).toBe(true);
  expect((await send("equipment:buy", { equipmentId: "xe_tra_sua", mode: "new" })).ok).toBe(true);

  // Cửa hàng trà sữa (đang quản lý) chọn chỗ vỉa hè trong 📍 Chỗ bán.
  await openFeature(page, "lot");
  const lot = page.locator('[data-lot="dau_hem"] button').first();
  await expect(lot).toBeEnabled();
  await lot.tap();
  await openFeature(page, "shops");
  const list = page.getByRole("dialog", { name: "🏬 Các cửa hàng" });
  await expect(list.locator("[data-shop-card]")).toHaveCount(2);
  await expect(list).toContainText("Đầu hẻm 12");
  await expect(list).toContainText("Nhà mặt tiền số 10");
  await shot(page, "141-tiem-nha-va-xe-via-he");
});
