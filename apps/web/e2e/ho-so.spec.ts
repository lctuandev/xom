import { expect, test } from "@playwright/test";
import { register, shot } from "./helpers";

// Chạm ô cấp độ (góc trái) → sheet Hồ sơ có chân dung + tên + cấp như khung NPC (góp ý đợt 3).
test("hồ sơ: chân dung, tên, cấp của mình", async ({ page }) => {
  await register(page, "Hồ Sơ");
  await page.getByRole("button", { name: "Hồ sơ" }).first().tap();
  const face = page.locator('[data-counterpart="Hồ Sơ"]');
  await expect(face).toBeVisible();
  await expect(face.getByRole("img", { name: "Chân dung Hồ Sơ" })).toBeVisible();
  await expect(face).toContainText("Cấp 1");
  await expect(face.locator("[data-line]")).not.toBeEmpty();
  await shot(page, "102-ho-so");
});
