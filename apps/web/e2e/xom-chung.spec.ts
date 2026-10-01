import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Xóm chung (docs/USECASES.md UC-J1, J2): An mời Bình bằng link; Bình vào xóm An,
// hai người thấy nhau đi lại (bảng tên trên đầu) và nghe nhau nói.
test("mời bạn bằng link, thấy nhau đi lại và nói chuyện", async ({ browser, page }, info) => {
  test.setTimeout(240_000);
  // An: vào game, bỏ qua lời Chú Bảy, mở bảng Xóm lấy mã.
  await register(page, "An");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await page.getByRole("button", { name: /^Hàng xóm: 1 người online/ }).tap();
  const code = (await page.locator("[data-xom-code]").textContent()) ?? "";
  expect(code).toMatch(/^[0-9a-f]{8}$/);
  await page
    .getByRole("dialog", { name: "Xóm" })
    .getByRole("button", { name: "Đóng" })
    .last()
    .tap();

  // Bình: mở link mời → đăng ký → vào game → bảng Xóm tự mở với lời mời.
  const ctx = await browser.newContext({ ...info.project.use });
  const bPage = await ctx.newPage();
  await register(bPage, "Bình", `/play?xom=${code}`);
  await (await readDialogue(bPage)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const sheet = bPage.getByRole("dialog", { name: "Xóm" });
  await expect(sheet.getByText(/Bạn được mời vào xóm/)).toBeVisible();
  await sheet.getByRole("button", { name: "Vào xóm" }).tap();
  await expect(bPage.getByText(/Đã vào xóm mới/)).toBeVisible();
  await expect(bPage.getByRole("button", { name: /^Hàng xóm: 2 người online/ })).toBeVisible();

  // An thấy Bình: số người online + bảng tên trên đầu.
  await expect(page.getByRole("button", { name: /^Hàng xóm: 2 người online/ })).toBeVisible();
  const tag = page.locator("[data-bubble]").filter({ hasText: /^Bình$/ });
  await expect(tag).toBeVisible();
  await shot(page, "20-thay-ban");

  // Bình đi ra quán cơm → trên màn hình An bảng tên di chuyển theo.
  const before = await tag.evaluate((el) => (el as HTMLElement).style.transform);
  await bPage.getByRole("button", { name: "🚶 Đi tới" }).tap();
  await expect
    .poll(() => tag.evaluate((el) => (el as HTMLElement).style.transform), { timeout: 15_000 })
    .not.toBe(before);

  // Bình chào → An thấy khung thoại trên đầu Bình (kèm tên).
  await bPage.getByRole("button", { name: "Nói" }).tap();
  await bPage.getByRole("button", { name: "Chào cả xóm!" }).tap();
  await expect(page.locator("[data-bubble]").filter({ hasText: "Chào cả xóm!" })).toContainText(
    "Bình",
  );
  await shot(page, "21-ban-noi");

  // Bình rời game → An thấy xóm còn 1 người.
  await ctx.close();
  await expect(page.getByRole("button", { name: /^Hàng xóm: 1 người online/ })).toBeVisible();
});
