import { expect, test } from "@playwright/test";
import { readDialogue, register, setClock, shot } from "./helpers";

// Đèn đường ban đêm (góp ý đợt 3): vầng sáng rọi cả vỉa hè lẫn mặt đường (trước đây nằm dưới mặt gạch vỉa hè).
test("đèn đường ban đêm rọi cả vỉa hè", async ({ page }) => {
  await register(page, "Đèn đường");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await setClock(page, 21 * 60);
  await page.waitForTimeout(2500);
  await expect(page.locator("[data-clock]")).toBeVisible();
  await shot(page, "104-den-duong-dem");
});
