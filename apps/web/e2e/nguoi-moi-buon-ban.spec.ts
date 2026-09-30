import { expect, test } from "@playwright/test";
import {
  BANH_MI_THIT,
  buyIngredients,
  makeDish,
  payOrder,
  readDialogue,
  register,
  shot,
  walkToObjective,
} from "./helpers";

// Kịch bản UC-C2 + UC-E1 + UC-F1…F7: người mới buôn bán bánh mì, tự tay làm món, thối tiền.
test("người mới: bán bánh mì — mua nguyên liệu, làm đúng món, thối đúng tiền", async ({ page }) => {
  await register(page);

  // 1. Chú Bảy bắt chuyện (khung thoại trên đầu), chọn nhánh buôn bán.
  let box = await readDialogue(page);
  await shot(page, "01-chu-bay");
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await expect(page.getByText("Tới vựa xe Ông Sáu mua một chiếc xe đẩy")).toBeVisible();

  // 2. Vựa xe Ông Sáu: mua xe bánh mì.
  await walkToObjective(page, /Xem xe đẩy · Ông Sáu/);
  await page.getByRole("button", { name: /Xem xe đẩy · Ông Sáu/ }).tap();
  await page
    .locator("li", { hasText: "Xe bánh mì kính" })
    .getByRole("button", { name: /Mua ·/ })
    .tap();

  // 3. Chợ Bà Năm: mua đủ nguyên liệu cho bánh mì thịt.
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await walkToObjective(page, /Vào chợ · Bà Năm/);
  await page.getByRole("button", { name: /Vào chợ · Bà Năm/ }).tap();
  await shot(page, "02-cho-nguyen-lieu");
  await buyIngredients(page, BANH_MI_THIT);

  // 4. Chọn chỗ bán rẻ: Đầu hẻm 12; tắt món chưa đủ nguyên liệu không bắt buộc (khách chỉ gọi món làm được).
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await page.getByRole("button", { name: "Mở", exact: true }).tap();
  await page.getByRole("button", { name: /Đầu hẻm 12/ }).tap();
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await expect(page.getByText("Đẩy xe tới chỗ bán và mở quầy")).toBeVisible();

  // 5. Đẩy xe tới chỗ, mở quầy.
  await walkToObjective(page, /Mở quầy · thuê chỗ/);
  await page.getByRole("button", { name: /Mở quầy · thuê chỗ/ }).tap();

  // 6. Phục vụ 3 khách: nghe dặn → làm từng bước → giao → tính tiền, thối tiền.
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  for (let i = 0; i < 3; i++) {
    const cook = page.getByRole("button", { name: /Làm món cho khách/ });
    await expect(cook).toBeVisible({ timeout: 90_000 });
    await cook.tap();
    if (i === 0) await shot(page, "03-lam-mon");
    await makeDish(page);
    if (i === 0) await shot(page, "04-tinh-tien");
    await payOrder(page);
    await expect(page.getByRole("dialog", { name: "Làm món" })).toHaveCount(0);
  }

  // 7. Chú Bảy dặn dò, kịch bản kết thúc.
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await expect(page.getByText(/🎯/)).toHaveCount(0);
  await shot(page, "05-xong");
});

test("làm sai món: khách phàn nàn, đưa luôn giảm giá; nói chuyện với Bà Năm; rao hàng", async ({
  page,
}) => {
  await register(page, "Lan");
  await (await readDialogue(page)).getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await walkToObjective(page, /Xem xe đẩy/);
  await page.getByRole("button", { name: /Xem xe đẩy/ }).tap();
  await page
    .locator("li", { hasText: "Xe bánh mì kính" })
    .getByRole("button", { name: /Mua ·/ })
    .tap();
  await (await readDialogue(page)).getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();

  // Nav "Chợ" tự đi bộ ra chợ; nói chuyện với Bà Năm trước khi mua.
  await page.getByRole("button", { name: "Chợ", exact: true }).tap();
  await expect(page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await page.getByRole("button", { name: "💬 Nói chuyện" }).tap();
  await page.getByRole("button", { name: "🗞️ Hỏi chuyện xóm" }).tap();
  await expect(page.locator('[data-bubble="cho_dau_moi"]')).toBeVisible();
  await shot(page, "06-noi-chuyen-ba-nam");
  await page.getByRole("button", { name: "Chợ", exact: true }).tap();
  await buyIngredients(page, BANH_MI_THIT);
  await (await readDialogue(page)).getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await page.getByRole("button", { name: "Mở", exact: true }).tap();
  await page.getByRole("button", { name: /Dưới gốc cây/ }).tap();
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await walkToObjective(page, /Mở quầy/);
  await page.getByRole("button", { name: /Mở quầy/ }).tap();
  await (await readDialogue(page)).getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();

  // Rao hàng: câu nói hiện trên đầu nhân vật mình.
  await page.getByRole("button", { name: "Nói" }).tap();
  await page.getByRole("button", { name: /Mời ghé ủng hộ/ }).tap();
  await expect(page.getByText(/Mời ghé ủng hộ nha/)).toBeVisible();

  // Làm sai phần ớt → khách phàn nàn → đưa luôn, giảm 50%.
  await expect(page.getByRole("button", { name: /Làm món cho khách/ })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: /Làm món cho khách/ }).tap();
  await makeDish(page, { mistake: "ot" });
  await expect(page.getByText("Khách phàn nàn: món sai!")).toBeVisible();
  await shot(page, "07-mon-sai");
  await page.getByRole("button", { name: /Đưa luôn, giảm 50%/ }).tap();
  await payOrder(page);
  await expect(page.getByRole("dialog", { name: "Làm món" })).toHaveCount(0);

  // Đi chỗ khác → quầy vắng chủ; về quầy.
  await page.getByRole("button", { name: "Chợ", exact: true }).tap();
  await expect(page.getByText("Quầy vắng chủ — khách không mua được")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await page.getByRole("button", { name: "Về quầy" }).tap();
  await expect(page.getByText("Quầy vắng chủ — khách không mua được")).toHaveCount(0, {
    timeout: 30_000,
  });
});
