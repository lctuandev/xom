import { expect, test } from "@playwright/test";
import { grantMoney, openFeature, readDialogue, register, shot } from "./helpers";

// Quỹ xóm + công trình chung (docs/USECASES.md UC-J5): đề xuất lát hẻm → (một mình) qua luôn →
// góp đủ quỹ → khởi công.
test("quỹ xóm: đề xuất công trình, góp quỹ, khởi công", async ({ page }) => {
  await register(page, "Quỹ");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await grantMoney(page, 600_000);

  await openFeature(page, "fund");
  const sheet = page.getByRole("dialog", { name: "Quỹ xóm" });
  await expect(sheet.locator("[data-fund]")).toHaveAttribute("data-fund", "0");

  const hem = sheet.locator('[data-propose="lat_hem_12"]');
  await expect(sheet.locator('[data-propose="cau_be_tong"]').getByRole("button")).toHaveText(
    "Phải làm công trình trước đó đã",
  );
  await shot(page, "98-de-xuat");
  await hem.getByRole("button", { name: /Đề xuất cả xóm bỏ phiếu/ }).tap();
  const card = sheet.locator("[data-project]");
  await expect(card).toHaveAttribute("data-project", "FUNDING");
  await expect(card.getByText(/Còn thiếu 600\.000đ/)).toBeVisible();

  await sheet.getByRole("button", { name: "💵 Tiền mặt" }).tap();
  await sheet.getByRole("button", { name: "Góp 500k" }).tap();
  await expect(card.getByText(/Còn thiếu 100\.000đ/)).toBeVisible();
  await sheet.getByRole("button", { name: "Góp 100k" }).tap();
  await expect(card).toHaveAttribute("data-project", "BUILDING");
  await expect(card.getByText(/Thợ đang làm/)).toBeVisible();
  await shot(page, "99-khoi-cong");
});
