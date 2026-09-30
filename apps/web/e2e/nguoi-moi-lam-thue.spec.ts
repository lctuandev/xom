import { expect, test } from "@playwright/test";
import { readDialogue, register, shot, walkToObjective } from "./helpers";

// Kịch bản người mới chọn làm thuê: Chú Bảy → quán cơm Cô Tư → xin việc → bưng 2 mâm → xong.
test("người mới: đi làm thuê ở quán cơm Cô Tư", async ({ page }) => {
  await register(page, "Hoa");
  const box = await readDialogue(page);
  await box.getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await expect(page.getByText("Tới quán cơm Cô Tư xin việc")).toBeVisible();

  await walkToObjective(page, /Vào quán · Cô Tư/);
  await page.getByRole("button", { name: /Vào quán · Cô Tư/ }).tap();
  await page.getByRole("button", { name: "Xin làm với Cô Tư" }).tap();
  await expect(page.getByText(/Đang đi làm/)).toBeVisible();

  for (let i = 0; i < 2; i++) {
    const task = page.getByRole("button", { name: /Bưng ra ngay/ });
    await expect(task).toBeVisible({ timeout: 60_000 });
    if (i === 0) await shot(page, "07-bung-com");
    await task.tap();
    await expect(page.getByText(/Làm tốt!/).first()).toBeVisible();
  }
  const done = await readDialogue(page);
  await expect(done.getByText(/vựa xe Ông Sáu/)).toBeVisible();
  await done.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
});
