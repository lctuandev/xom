import { expect, test } from "@playwright/test";
import { readDialogue, register, shot, walkToObjective } from "./helpers";

// Kịch bản người mới chọn buôn bán: Chú Bảy → vựa xe → chợ → chọn chỗ → mở quầy → đưa hàng 3 khách.
test("người mới: buôn bán bánh mì theo hướng dẫn của Chú Bảy", async ({ page }) => {
  await register(page);

  // 1. Gặp Chú Bảy, chọn nhánh buôn bán.
  let box = await readDialogue(page);
  await shot(page, "01-chu-bay");
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await expect(page.getByText("Tới vựa xe Ông Sáu mua một chiếc xe đẩy")).toBeVisible();

  // 2. Đi tới vựa xe, nói chuyện với Ông Sáu, mua xe bánh mì.
  await walkToObjective(page, /Xem xe đẩy · Ông Sáu/);
  await page.getByRole("button", { name: /Xem xe đẩy · Ông Sáu/ }).tap();
  await expect(page.getByText(/Xe nào cũng chắc hết/)).toBeVisible();
  await shot(page, "02-vua-xe");
  await page
    .locator("li", { hasText: "Xe bánh mì kính" })
    .getByRole("button", { name: /Mua ·/ })
    .tap();

  // 3. Chú Bảy dặn ra chợ; đi tới chợ Bà Năm nhập 10 bánh mì.
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await walkToObjective(page, /Vào chợ · Bà Năm/);
  await page.getByRole("button", { name: /Vào chợ · Bà Năm/ }).tap();
  const row = page.locator("li", { hasText: "Bánh mì thịt" });
  await expect(row.getByText(/Còn lại/)).toBeVisible();
  await shot(page, "03-cho");
  await row.getByRole("button", { name: /^Nhập 10/ }).tap();

  // 4. Nhập xong Chú Bảy bắt chuyện (bảng chợ tự đóng); chọn chỗ bán rẻ cho người mới: Đầu hẻm 12.
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await page.getByRole("button", { name: "Mở", exact: true }).tap();
  await expect(page.getByText("10", { exact: true })).toBeVisible(); // hàng trong kho
  await page.getByRole("button", { name: /Đầu hẻm 12/ }).tap();
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await expect(page.getByText("Đẩy xe tới chỗ bán và mở quầy")).toBeVisible();

  // 5. Đẩy xe tới chỗ, mở quầy ngay tại chỗ.
  await walkToObjective(page, /Mở quầy · thuê chỗ/);
  await page.getByRole("button", { name: /Mở quầy · thuê chỗ/ }).tap();

  // 6. Phục vụ 3 khách: bấm "Đưa" khi khách gọi món.
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await expect(page.getByText("Phục vụ 3 khách đầu tiên (bấm Đưa hàng)")).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const serve = page.getByRole("button", { name: /🤲 Đưa/ });
    await expect(serve).toBeVisible({ timeout: 60_000 });
    if (i === 0) await shot(page, "04-khach-goi-mon");
    await serve.tap();
    await expect(page.getByText(/Khách boa/).first()).toBeVisible();
  }

  // 7. Chú Bảy chúc đắt hàng, kịch bản kết thúc.
  box = await readDialogue(page);
  await expect(box.getByText(/chúc con đắt hàng/)).toBeVisible();
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await expect(page.getByText(/🎯/)).toHaveCount(0);
  await shot(page, "05-xong");
});

test("rời quầy thì quầy vắng chủ, về quầy bán tiếp", async ({ page }) => {
  await register(page, "Lan");
  const box = await readDialogue(page);
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await walkToObjective(page, /Xem xe đẩy/);
  await page.getByRole("button", { name: /Xem xe đẩy/ }).tap();
  await page
    .locator("li", { hasText: "Sạp phụ kiện" })
    .getByRole("button", { name: /Mua ·/ })
    .tap();
  await (await readDialogue(page)).getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  // Nav "Chợ" tự đi bộ ra chợ rồi mở.
  await page.getByRole("button", { name: "Chợ", exact: true }).tap();
  const row = page.locator("li", { hasText: "Phụ kiện" });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: /^Nhập/ }).tap();
  await (await readDialogue(page)).getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await page.getByRole("button", { name: "Mở", exact: true }).tap();
  await page.getByRole("button", { name: /Dưới gốc cây/ }).tap();
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await walkToObjective(page, /Mở quầy/);
  await page.getByRole("button", { name: /Mở quầy/ }).tap();
  await (await readDialogue(page)).getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();

  // Đi chỗ khác → quầy vắng chủ.
  await page.getByRole("button", { name: "Chợ", exact: true }).tap();
  await expect(page.getByText("Quầy vắng chủ — khách không mua được")).toBeVisible({
    timeout: 15_000,
  });
  await shot(page, "06-vang-chu");
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await page.getByRole("button", { name: "Về quầy" }).tap();
  await expect(page.getByText("Quầy vắng chủ — khách không mua được")).toHaveCount(0, {
    timeout: 30_000,
  });
});
