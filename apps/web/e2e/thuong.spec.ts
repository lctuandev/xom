import { expect, type Page, test } from "@playwright/test";
import { content } from "@xom/content";
import {
  closeSheet,
  openBanhMiStall,
  openFeature,
  register,
  serveCustomer,
  shot,
  waitForMorning,
} from "./helpers";

const cash = async (page: Page) =>
  Number(await page.locator("[data-money]").getAttribute("data-money"));

// Thưởng thành tựu + nhiệm vụ hằng ngày (docs/USECASES.md UC-P4): bán 5 món → nhận 🎁 nhiệm vụ "Bán 5 món" và thành
// tựu "Mở hàng"; tiền mặt tăng đúng phần thưởng, nhận rồi thì không nhận lại được.
test("bán 5 món: nhận thưởng nhiệm vụ hôm nay + thành tựu Mở hàng", async ({ page }) => {
  test.setTimeout(600_000);
  await register(page, "Thưởng");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  for (let i = 0; i < 5; i++) {
    await serveCustomer(page);
    // Bán xong 3 khách đầu thì Chú Bảy dặn dò — nghe rồi bán tiếp.
    const bay = page.getByRole("dialog", { name: "Chú Bảy xe ôm" });
    if (await bay.isVisible()) {
      while (await bay.getByRole("button", { name: "Tiếp ›" }).isVisible())
        await bay.getByRole("button", { name: "Tiếp ›" }).tap();
      await bay.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
    }
  }

  // 🎯 Nhiệm vụ → Hôm nay: "Bán 5 món" xong, có nút 🎁 Nhận.
  const quest = content.data.dailyQuests.find((q) => q.id === "ban_5");
  if (!quest) throw new Error("thiếu nhiệm vụ ban_5");
  await openFeature(page, "quests");
  const row = page.locator('[data-quest="ban_5"]');
  await row.scrollIntoViewIfNeeded();
  await expect(row).toHaveAttribute("data-done", "true");
  // Nhiệm vụ chưa xong thì không có nút nhận.
  await expect(page.locator('[data-quest="ban_20"] [data-claim]')).toHaveCount(0);
  await shot(page, "95-nhiem-vu-thuong");
  const before = await cash(page);
  await row.locator('[data-claim="ban_5"]').tap();
  await expect(row.getByText("✓ Đã nhận")).toBeVisible();
  await expect(page.getByText(/🎁 🥖 Bán 5 món: \+3\.000đ/)).toBeVisible();
  await expect.poll(() => cash(page)).toBe(before + quest.reward.money);

  // Mở lại: server nhớ đã nhận hôm nay.
  await closeSheet(page);
  await openFeature(page, "quests");
  await expect(page.locator('[data-quest="ban_5"]').getByText("✓ Đã nhận")).toBeVisible();
  await closeSheet(page);

  // 🏅 Thành tựu: "Mở hàng" đạt, chưa nhận → xếp đầu, bấm 🎁 Nhận.
  const ach = content.data.achievements.find((a) => a.id === "mo_hang");
  if (!ach) throw new Error("thiếu thành tựu mo_hang");
  await openFeature(page, "badges");
  const badge = page.locator('[data-achievement="mo_hang"]');
  await expect(page.locator("[data-achievement]").first()).toHaveAttribute(
    "data-achievement",
    "mo_hang",
  );
  await shot(page, "96-thanh-tuu-thuong");
  const mid = await cash(page);
  await badge.locator('[data-claim="mo_hang"]').tap();
  await expect(badge.getByText("✓ Đã nhận")).toBeVisible();
  await expect.poll(() => cash(page)).toBe(mid + ach.reward.money);
  await closeSheet(page);
  await openFeature(page, "badges");
  await expect(page.locator('[data-achievement="mo_hang"] [data-claim]')).toHaveCount(0);
  await expect(page.locator('[data-achievement="mo_hang"]').getByText("✓ Đã nhận")).toBeVisible();
});
