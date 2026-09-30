import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Góc nhìn tự do (docs/USECASES.md UC-B7): xoay quanh nhân vật, nghiêng, về hướng mặc định.
test("xoay, nghiêng góc nhìn rồi về hướng mặc định", async ({ page }) => {
  await register(page, "Xoay");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const canvas = page.locator("canvas").first();
  await page.waitForTimeout(800);
  const before = await canvas.screenshot();

  await page.getByRole("button", { name: "Xoay phải" }).tap();
  await page.getByRole("button", { name: "Xoay phải" }).tap();
  await page.waitForTimeout(1200);
  const rotated = await canvas.screenshot();
  expect(rotated.equals(before)).toBe(false);
  await shot(page, "30-xoay");

  await page.getByRole("button", { name: "Nhìn thấp xuống" }).tap();
  await page.getByRole("button", { name: "Nhìn thấp xuống" }).tap();
  await page.waitForTimeout(1200);
  await shot(page, "31-nghieng");

  await page.getByRole("button", { name: "Về hướng mặc định" }).tap();
  await page.waitForTimeout(1500);
  await shot(page, "32-mac-dinh");
});
