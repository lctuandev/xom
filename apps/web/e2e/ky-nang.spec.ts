import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Kỹ năng + mở khoá theo cấp (docs/USECASES.md UC-P1): Hồ sơ hiện kỹ năng, chào Bà Năm thì "Ăn nói" nhích lên;
// những thứ chưa đủ cấp thì có ổ khoá.
test("hồ sơ: kỹ năng nhích lên khi chào hỏi, mở khoá theo cấp", async ({ page }) => {
  await register(page, "Năng");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await page.getByRole("button", { name: "Ra chợ" }).tap();
  await expect(page.getByRole("dialog", { name: "Chợ đầu mối Bà Năm" })).toBeVisible({
    timeout: 40_000,
  });
  await page
    .getByRole("dialog", { name: "Chợ đầu mối Bà Năm" })
    .getByRole("button", { name: "Đóng" })
    .last()
    .tap();
  await page.getByRole("button", { name: "💬 Nói chuyện" }).tap();
  const talk = page.getByRole("dialog", { name: "Nói chuyện với Bà Năm" });
  await talk.getByRole("button", { name: "👋 Chào hỏi" }).tap();
  await expect(talk.getByRole("listitem").filter({ hasText: "👋 Chào hỏi" })).toBeVisible();
  await talk.getByRole("button", { name: "Đóng" }).tap();
  await expect(talk).toBeHidden();

  await page.getByRole("button", { name: "Hồ sơ" }).tap();
  await page.getByRole("tab", { name: "📈 Kỹ năng" }).tap();
  const skills = page.getByRole("region", { name: "Kỹ năng" });
  await expect(skills.locator('[data-skill="an_noi"]')).toBeVisible();
  await expect(skills.getByText("🔒 Cấp 3: Thuê nhà mặt tiền mở tiệm")).toBeVisible();
  await shot(page, "95-ky-nang");
});
