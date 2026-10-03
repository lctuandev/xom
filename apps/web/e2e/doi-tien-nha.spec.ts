import { expect, type Page, test } from "@playwright/test";
import {
  grantMoney,
  openFeature,
  readDialogue,
  register,
  setClock,
  shot,
  walkToObjective,
} from "./helpers";

// Đòi tiền nhà (docs/USECASES.md UC-F13): 17h chủ nhà tới — modal chân dung + bong bóng thoại; đang kẹt thì xin hẹn
// NGÀY trả (phí trễ theo số ngày); sau đó vào Làm ăn → 🏪 Mở tiệm trả ngay, chủ nhà cảm ơn.
const debug = (page: Page, event: string, payload: unknown) =>
  page.evaluate(
    async ([e, p]) => {
      const dbg = (
        window as unknown as {
          xomDebug?: {
            send: (e: string, p: unknown) => Promise<{ ok: boolean; message?: string }>;
          };
        }
      ).xomDebug;
      const r = await dbg?.send(e as string, p);
      return r?.ok ? true : (r?.message ?? "không gửi được");
    },
    [event, payload] as const,
  );

test("chủ nhà tới đòi tiền nhà: hẹn ngày trả, rồi trả ngay trong mục Mở tiệm", async ({ page }) => {
  test.setTimeout(180_000);
  await register(page, "Người thuê");
  await grantMoney(page, 1_000_000);
  // Mua xe ở vựa Ông Sáu (phải đứng tại vựa), rồi thuê nhà + đủ giấy tờ bằng lệnh dev (giấy tờ: kịch bản mo-tiem).
  const box = await readDialogue(page);
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await walkToObjective(page, /Xem xe đẩy · Ông Sáu/);
  expect(await debug(page, "equipment:buy", { equipmentId: "xe_banh_mi" })).toBe(true);
  expect(await debug(page, "debug:shop", { lotId: "nha_so_10" })).toBe(true);
  const day = await page.evaluate(
    () =>
      (window as unknown as { xomDebug: { clock: () => { day: number } } }).xomDebug.clock().day,
  );

  // Hôm sau 17h: Cô Tư Hường tới nhắc tiền nhà.
  await setClock(page, 17 * 60 - 2, day + 1);
  const ask = page.getByRole("dialog", { name: "🏠 Chủ nhà tới đòi tiền nhà" });
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await setClock(page, 17 * 60);
  await expect(ask.locator('[data-counterpart="Cô Tư Hường"]')).toBeVisible();
  await expect(ask.locator("[data-rent-due]")).toContainText("105.000đ");
  await shot(page, "120-chu-nha-doi");

  // Kẹt tiền: hẹn tới ngày mai (hẹn theo ngày, không theo giờ).
  await ask
    .getByRole("button", { name: /🗓️ Hẹn tới .*ngày/ })
    .first()
    .tap();
  const promised = page.getByRole("dialog", { name: "🗓️ Đã hẹn ngày trả" });
  await expect(promised).toBeVisible();
  await expect(promised.locator(`[data-rent-promise="${day + 2}"]`)).toBeVisible();
  await shot(page, "121-hen-ngay");
  await promised.getByRole("button", { name: "Đóng" }).last().tap();
  await expect(promised).toHaveCount(0);

  // Trả ngay ở ☰ Menu → 🏠 Thuê nhà & giấy tờ (kèm phí trễ đã chốt).
  await openFeature(page, "lease");
  const shop = page.getByRole("region", { name: "Mở tiệm" });
  await expect(shop.locator(`[data-rent-promise="${day + 2}"]`)).toBeVisible();
  await shop.getByRole("button", { name: /💵 Trả ngay · 116\.000đ/ }).tap();
  const thanks = page.getByRole("dialog", { name: "🏠 Trả đủ tiền nhà" });
  await expect(thanks).toBeVisible();
  await expect(thanks.locator("[data-rent-owed]")).toHaveAttribute("data-rent-owed", "0");
  await shot(page, "122-tra-tien-nha");
  await thanks.getByRole("button", { name: "Đóng" }).last().tap();
  await expect(shop.locator("[data-rent-owed]")).toHaveAttribute("data-rent-owed", "0");
});

// 🔁 Tự trả tiền nhà khi tới hạn (góp ý đợt 3): bật trong 🏠 Thuê nhà & giấy tờ, ghi cách trả đang chọn.
test("bật tự trả tiền nhà khi tới hạn", async ({ page }) => {
  test.setTimeout(180_000);
  await register(page, "Tự trả");
  await grantMoney(page, 1_000_000);
  const box = await readDialogue(page);
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await walkToObjective(page, /Xem xe đẩy · Ông Sáu/);
  expect(await debug(page, "equipment:buy", { equipmentId: "xe_banh_mi" })).toBe(true);
  expect(await debug(page, "debug:shop", { lotId: "nha_so_10" })).toBe(true);
  await openFeature(page, "lease");
  const toggle = page.getByRole("checkbox", { name: "Tự trả tiền nhà khi tới hạn" });
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toHaveAttribute("data-rent-auto", "off");
  await toggle.tap();
  await expect(toggle).not.toHaveAttribute("data-rent-auto", "off");
  await shot(page, "103-tu-tra-tien-nha");
  await toggle.tap();
  await expect(toggle).toHaveAttribute("data-rent-auto", "off");
});
