import { expect, test } from "@playwright/test";
import {
  makeDish,
  openBanhMiStall,
  openFeature,
  payOrder,
  readDialogue,
  register,
  setClock,
  shot,
  waitForMorning,
} from "./helpers";

// Mua của nhau (docs/USECASES.md UC-J3): An mở xe bánh mì; Bình vào xóm An, tới quầy gọi món
// "không hành"; An làm tay đúng lời dặn; Bình trả tiền mặt, An thối; Bình chấm sao, An trả lời (UC-F11).
test("gọi món ở quầy hàng xóm, chủ quầy làm tay, khách trả tiền mặt, chủ quầy thối", async ({
  browser,
  page,
}, info) => {
  test.setTimeout(600_000);
  await register(page, "An");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  await setClock(page, 7 * 60);
  await page.getByRole("button", { name: /^Hàng xóm: 1 người online/ }).tap();
  const code = (await page.locator("[data-xom-code]").textContent()) ?? "";
  await page
    .getByRole("dialog", { name: "👥 Hàng xóm" })
    .getByRole("button", { name: "Đóng" })
    .last()
    .tap();

  // Bình vào xóm An qua link mời.
  const ctx = await browser.newContext({ ...info.project.use });
  const b = await ctx.newPage();
  await register(b, "Bình", `/play?xom=${code}`);
  await (await readDialogue(b)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await b
    .getByRole("dialog", { name: "👥 Hàng xóm" })
    .getByRole("button", { name: "Vào xóm" })
    .tap();
  await expect(b.getByText(/Đã vào xóm mới/)).toBeVisible();

  // Hai người cùng chơi trên máy chậm thì kịch bản dài hơn một ngày game — tua xóm về sáng sớm.
  await setClock(page, 7 * 60);

  // Bình mở bảng Xóm → "Tới quầy" của An → tới nơi bảng gọi món tự mở.
  await b.getByRole("button", { name: /^Hàng xóm: 2 người online/ }).tap();
  await b.getByRole("button", { name: "🛒 Tới quầy" }).tap();
  const shop = b.getByRole("dialog", { name: "Quầy An" });
  await expect(shop).toBeVisible({ timeout: 30_000 });
  // Đứng trước quầy (UC-E5): chân dung An + lời chào ở trên sheet.
  await expect(shop.getByRole("img", { name: "Chân dung An" })).toBeVisible();
  await shop.getByRole("button", { name: /bánh mì thịt/i }).tap();
  await shop.getByRole("button", { name: "không hành" }).tap();
  await expect(shop.locator("[data-dish]")).toHaveAttribute(
    "data-dish",
    "bánh mì thịt, không hành",
  );
  // Câu mình dặn hiện bên phải, chủ quầy "xác nhận" món + giá.
  await expect(shop.locator("[data-me]")).toContainText("không hành");
  await expect(shop.locator("[data-line]")).toContainText(/bánh mì thịt, không hành/i);
  await shot(b, "22-goi-mon-hang-xom");
  const moneyBefore = Number(await b.locator("[data-money]").getAttribute("data-money"));
  // Quầy đông (đủ hàng chờ) thì đợi bớt khách rồi gọi lại — như ngoài đời.
  const waiting = b.getByText(/⏳ Chờ An làm: bánh mì thịt, không hành/);
  for (let i = 0; i < 12 && !(await waiting.isVisible()); i++) {
    if (await shop.isVisible()) await shop.getByRole("button", { name: /^🛒 Gọi món ·/ }).tap();
    await waiting.waitFor({ timeout: 8_000 }).catch(() => undefined);
  }
  await expect(waiting).toBeVisible();

  // An mở màn hình làm món; khách NPC tới trước thì xin lỗi cho qua (cho nhanh), tới đơn Bình thì làm tay.
  for (let i = 0; i < 8; i++) {
    const cook = page.getByRole("button", { name: /Làm món cho khách/ });
    await expect(cook).toBeVisible({ timeout: 60_000 });
    await cook.tap();
    const kitchen = page.getByRole("dialog", { name: "Làm món" });
    await expect(kitchen).toBeVisible();
    if (!(await kitchen.locator("[data-counterpart=Bình]").isVisible())) {
      await kitchen.getByRole("button", { name: /Xin lỗi, hết món này rồi/ }).tap();
      await expect(kitchen).toHaveCount(0);
      continue;
    }
    await shot(page, "23-lam-mon-cho-ban");
    await makeDish(page);
    await payOrder(page);
    await expect(kitchen).toHaveCount(0);
    break;
  }

  // Bình nhận món: món lặt vặt nên "tự chọn" trả tiền mặt (UC-I8) — đưa một tờ, An thối lại.
  await expect(
    b.getByText(/💵 Đưa .*, trả .* — nhận bánh mì thịt, không hành/).first(),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await b.locator("[data-money]").getAttribute("data-money")))
    .toBeLessThan(moneyBefore);
  await shot(b, "24-nhan-mon");

  // Sổ đánh giá (UC-F11): Bình vừa mua nên chấm sao + viết vài chữ; An trả lời trong bảng Làm ăn.
  await b.getByRole("button", { name: /^Hàng xóm: 2 người online/ }).tap();
  await b.getByRole("button", { name: "🛒 Tới quầy" }).tap();
  await expect(shop).toBeVisible({ timeout: 30_000 });
  const write = shop.locator("[data-write-review]");
  await expect(write).toBeVisible();
  await write.getByRole("radio", { name: "4 sao" }).tap();
  await write.getByRole("textbox", { name: "Lời đánh giá" }).fill("Bánh giòn, chủ quầy làm kỹ");
  await write.getByRole("button", { name: "Gửi" }).tap();
  await expect(shop.getByText("Bánh giòn, chủ quầy làm kỹ")).toBeVisible();
  await expect(write).toHaveCount(0);
  await shot(b, "25-danh-gia");

  await openFeature(page, "reviews");
  const book = page.getByRole("region", { name: "Sổ đánh giá" });
  const review = book.locator("[data-review]").filter({ hasText: "Bánh giòn" });
  await review.scrollIntoViewIfNeeded();
  await review.getByRole("button", { name: "💬 Trả lời" }).tap();
  await review.getByRole("button", { name: "Cảm ơn bạn nhiều nha! 🥰" }).tap();
  await expect(review.getByText(/Chủ quầy: Cảm ơn bạn nhiều nha!/)).toBeVisible();
  await shot(page, "26-tra-loi-danh-gia");
  await ctx.close();
});
